const ApiError = require('../../utils/ApiError');
const env = require('../../config/env');
const ai = require('../../integrations/ai');
const Proposal = require('./knowledge.proposal.model');
const PersonalConcept = require('./knowledge.personal.model');
const { LEVELS, MAX_PROPOSAL_NODES, parseProposalText } = require('./knowledge.helpers');
const {
  getOwnedSubject,
  subjectTitle,
  subjectNodes,
  nextOrder,
  assertRoom,
} = require('./knowledge.personal.service');

const toPublicProposal = (p) => ({
  id: p.id,
  subject: String(p.studentSubject),
  summary: p.summary,
  status: p.status,
  nodes: p.nodes.map((n) => ({ ref: n.ref, parentRef: n.parentRef, level: n.level, name: n.name, description: n.description })),
  createdNodeCount: p.createdNodeCount,
  decidedAt: p.decidedAt,
  createdAt: p.createdAt,
});

const countLevel = (nodes, level) => nodes.filter((n) => n.level === level).length;

async function getOwnedProposal(proposalId, ownerId) {
  const proposal = await Proposal.findOne({ _id: proposalId, owner: ownerId });
  if (!proposal) throw ApiError.notFound('Không tìm thấy đề xuất');
  return proposal;
}

function assertPending(proposal) {
  if (proposal.status !== 'pending') {
    throw ApiError.conflict('Đề xuất này đã được xử lý', 'PROPOSAL_ALREADY_DECIDED');
  }
}

async function listProposals(subjectId, ownerId, { status } = {}) {
  const subject = await getOwnedSubject(subjectId, ownerId);
  const filter = { owner: ownerId, studentSubject: subject._id };
  if (status) filter.status = status;
  const proposals = await Proposal.find(filter).sort({ createdAt: -1 }).limit(50);
  return proposals.map(toPublicProposal);
}

/** Stores a proposal. Also the entry point for the AIA pipeline once it reads uploaded documents. */
async function createProposal(subjectId, ownerId, { summary = '', nodes }) {
  const subject = await getOwnedSubject(subjectId, ownerId);
  if (!nodes || nodes.length === 0) {
    throw ApiError.badRequest('Đề xuất không có nút nào', 'EMPTY_PROPOSAL');
  }
  const proposal = await Proposal.create({
    owner: ownerId,
    studentSubject: subject._id,
    summary,
    nodes: nodes.slice(0, MAX_PROPOSAL_NODES),
    createdBy: String(ownerId),
  });
  return toPublicProposal(proposal);
}

// Asks the AI for a structure and stores it as a pending proposal. Nothing is written to the real structure.
async function generateProposal(subjectId, ownerId, { hint } = {}) {
  const subject = await getOwnedSubject(subjectId, ownerId);
  if (!env.GEMINI_API_KEY) {
    throw new ApiError(503, 'Dịch vụ AI chưa được cấu hình nên chưa thể đề xuất cấu trúc', 'AI_NOT_CONFIGURED');
  }
  const title = subjectTitle(subject);
  const existing = (await subjectNodes(ownerId, subject._id))
    .filter((n) => n.status === 'active' && n.level === LEVELS.CHAPTER)
    .map((n) => n.name);

  const prompt =
    `Đề xuất cấu trúc kiến thức cho môn học "${title}"${hint ? ` (gợi ý của sinh viên: ${hint})` : ''}.\n` +
    (existing.length ? `Các chương đã có, đừng lặp lại: ${existing.join('; ')}.\n` : '') +
    'Trả lời CHÍNH XÁC theo định dạng dưới đây, mỗi nút một dòng, đúng thứ tự cây, không thêm chữ nào khác:\n' +
    'CHAPTER: <tên chương>\nTOPIC: <tên chủ đề>\nCONCEPT: <tên khái niệm> | <mô tả ngắn 1 câu>\n' +
    `Tối đa 6 chương, mỗi chương tối đa 4 chủ đề, mỗi chủ đề tối đa 4 khái niệm, tổng không quá ${MAX_PROPOSAL_NODES} dòng.`;

  const { answer } = await ai.ask(prompt);
  const { nodes } = parseProposalText(answer);
  if (nodes.length === 0) {
    throw new ApiError(422, 'AI không trả về cấu trúc hợp lệ, hãy thử lại', 'AI_INVALID_RESPONSE');
  }
  const summary =
    `AI đề xuất ${countLevel(nodes, LEVELS.CHAPTER)} chương, ${countLevel(nodes, LEVELS.TOPIC)} chủ đề, ` +
    `${countLevel(nodes, LEVELS.CONCEPT)} khái niệm cho "${title}".`;
  return createProposal(subjectId, ownerId, { summary, nodes });
}

// UC-KNW-13: write the proposed nodes into the student's structure. Same-name nodes are reused.
async function confirmProposal(proposalId, ownerId) {
  const proposal = await getOwnedProposal(proposalId, ownerId);
  assertPending(proposal);
  const subject = await getOwnedSubject(proposal.studentSubject, ownerId);
  await assertRoom(ownerId, subject._id, proposal.nodes.length);

  const existing = (await subjectNodes(ownerId, subject._id)).filter((n) => n.status === 'active');
  const keyOf = (parent, name) => `${parent ?? 'root'}|${name.trim().toLowerCase()}`;
  const index = new Map(existing.map((n) => [keyOf(n.parentNode, n.name), n]));
  const byRef = new Map();
  let created = 0;

  for (const item of proposal.nodes) {
    const parent = item.parentRef ? byRef.get(item.parentRef) : null;
    if (item.parentRef && !parent) continue;
    const key = keyOf(parent ? parent._id : null, item.name);
    const found = index.get(key);
    if (found) {
      byRef.set(item.ref, found);
      continue;
    }
    // eslint-disable-next-line no-await-in-loop
    const node = await PersonalConcept.create({
      owner: ownerId,
      studentSubject: subject._id,
      parentNode: parent ? parent._id : null,
      level: item.level,
      name: item.name,
      description: item.description,
      // eslint-disable-next-line no-await-in-loop
      order: await nextOrder(ownerId, subject._id, parent ? parent._id : null),
      source: 'ai',
      createdBy: String(ownerId),
    });
    byRef.set(item.ref, node);
    index.set(key, node);
    created += 1;
  }

  proposal.status = 'confirmed';
  proposal.decidedAt = new Date();
  proposal.createdNodeCount = created;
  proposal.updatedBy = String(ownerId);
  await proposal.save();
  return toPublicProposal(proposal);
}

// UC-KNW-14
async function rejectProposal(proposalId, ownerId) {
  const proposal = await getOwnedProposal(proposalId, ownerId);
  assertPending(proposal);
  proposal.status = 'rejected';
  proposal.decidedAt = new Date();
  proposal.updatedBy = String(ownerId);
  await proposal.save();
  return toPublicProposal(proposal);
}

module.exports = { listProposals, createProposal, generateProposal, confirmProposal, rejectProposal };
