const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const QuestionItem = require('./question-bank.model');
const QuestionIssueReport = require('./question-issue-report.model');
const { createSchema } = require('./question-bank.validation');
const AssessmentItem = require('../assessment/assessment.model');
const assessmentService = require('../assessment/assessment.service');
const Concept = require('../knowledge/knowledge.model');
const AiAssistItem = require('../ai-assist/ai-assist.model');
const { ROLES } = require('../../shared/roles');

const UPDATABLE_FIELDS = ['concept', 'type', 'text', 'options', 'referenceAnswer', 'difficulty', 'points'];

// Students must never see which option is correct or the reference answer.
function stripAnswer(question, requester) {
  const plain = question.toObject ? question.toObject() : question;
  if (requester.role === ROLES.ADMIN) return plain;
  return {
    ...plain,
    options: plain.options.map((o) => ({ text: o.text })),
    referenceAnswer: undefined,
  };
}

function normalizeForDuplicateCheck(text) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

async function create(ownerId, data) {
  const concept = await Concept.findById(data.concept);
  if (!concept) throw ApiError.badRequest('Concept not found', 'CONCEPT_NOT_FOUND');
  return QuestionItem.create({ owner: ownerId, createdBy: ownerId, ...data });
}

async function list(query, requester) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {
    ...(query.concept ? { concept: query.concept } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.difficulty ? { difficulty: query.difficulty } : {}),
    status: query.status ?? (requester.role === ROLES.ADMIN ? undefined : 'active'),
  };
  if (filter.status === undefined) delete filter.status;
  const [items, total] = await Promise.all([
    QuestionItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    QuestionItem.countDocuments(filter),
  ]);
  return { items: items.map((i) => stripAnswer(i, requester)), meta: buildMeta(page, limit, total) };
}

async function getById(id, requester) {
  const item = await QuestionItem.findById(id);
  if (!item) throw ApiError.notFound('Question not found');
  return stripAnswer(item, requester);
}

async function getRaw(id) {
  const item = await QuestionItem.findById(id);
  if (!item) throw ApiError.notFound('Question not found');
  return item;
}

async function update(id, requesterId, data) {
  const item = await getRaw(id);
  if (data.concept) {
    const concept = await Concept.findById(data.concept);
    if (!concept) throw ApiError.badRequest('Concept not found', 'CONCEPT_NOT_FOUND');
  }
  UPDATABLE_FIELDS.forEach((field) => {
    if (data[field] !== undefined) item[field] = data[field];
  });
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

async function duplicate(id, ownerId) {
  const source = await getRaw(id);
  const plain = source.toObject();
  delete plain._id;
  delete plain.createdAt;
  delete plain.updatedAt;
  return QuestionItem.create({
    ...plain,
    owner: ownerId,
    createdBy: ownerId,
    updatedBy: null,
    text: `${plain.text} (copy)`,
  });
}

async function updateStatus(id, requesterId, status) {
  const item = await getRaw(id);
  item.status = status;
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

async function remove(id) {
  const item = await getRaw(id);
  await item.softDelete();
}

// UC-QBK-07: accepts already-parsed rows (file parsing to this shape happens client-side / in a future
// upload step); returns a success/error report per row rather than failing the whole batch.
async function importBulk(ownerId, rows) {
  const created = [];
  const errors = [];
  for (let i = 0; i < rows.length; i += 1) {
    const parsed = createSchema.safeParse(rows[i]);
    if (!parsed.success) {
      errors.push({ row: i, message: parsed.error.issues.map((iss) => iss.message).join('; ') });
      continue;
    }
    try {
      // eslint-disable-next-line no-await-in-loop
      const item = await create(ownerId, parsed.data);
      created.push(item.id);
    } catch (err) {
      errors.push({ row: i, message: err.message });
    }
  }
  return { createdCount: created.length, createdIds: created, errorCount: errors.length, errors };
}

// UC-QBK-08: hands back the filtered set as data; turning it into an .xlsx/.csv file is a presentation
// concern left to the caller/export job.
async function exportAll(query, requester) {
  const filter = {
    ...(query.concept ? { concept: query.concept } : {}),
    ...(query.status ? { status: query.status } : { status: undefined }),
  };
  if (filter.status === undefined) delete filter.status;
  const items = await QuestionItem.find(filter).sort({ createdAt: -1 }).limit(1000);
  return items.map((i) => stripAnswer(i, requester));
}

// UC-QBK-09: promotes an AI-generated draft (AiAssistItem.kind === 'generate_question') into the bank.
async function approveFromAiDraft(ownerId, { aiAssistLogId, concept, text, options, difficulty, points }) {
  const log = await AiAssistItem.findById(aiAssistLogId);
  if (!log || log.kind !== 'generate_question') throw ApiError.notFound('AI question draft not found');

  const resolvedConcept = concept ?? log.concept;
  const item = await create(ownerId, {
    concept: resolvedConcept,
    type: 'mcq',
    text: text ?? log.response,
    options,
    difficulty,
  });
  if (points) {
    item.points = points;
    await item.save();
  }
  log.approvedQuestion = item._id;
  await log.save();
  return item;
}

async function reportIssue(reporterId, questionId, { reason, description }) {
  await getRaw(questionId);
  return QuestionIssueReport.create({
    question: questionId,
    reportedBy: reporterId,
    createdBy: reporterId,
    reason,
    description,
  });
}

async function listIssueReports(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = query.status ? { status: query.status } : {};
  const [items, total] = await Promise.all([
    QuestionIssueReport.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('question', 'text'),
    QuestionIssueReport.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function resolveIssueReport(id, adminId, { action, resolution }) {
  const report = await QuestionIssueReport.findById(id);
  if (!report) throw ApiError.notFound('Issue report not found');
  report.status = action === 'fix' ? 'resolved' : 'dismissed';
  report.resolution = resolution ?? '';
  report.resolvedBy = adminId;
  report.resolvedAt = new Date();
  report.updatedBy = adminId;
  await report.save();
  return report;
}

// UC-QBK-11: correctness rate per question, derived from graded attempts, plus open issue-report counts.
async function qualityStats({ concept }) {
  const matchQuestion = concept ? { concept: new mongoose.Types.ObjectId(concept) } : {};
  const questions = await QuestionItem.find(matchQuestion).select('_id text concept');
  const questionIds = questions.map((q) => q._id);
  if (questionIds.length === 0) return [];

  const attemptStats = await AssessmentItem.aggregate([
    { $match: { status: 'submitted' } },
    { $unwind: '$answers' },
    { $match: { 'answers.question': { $in: questionIds } } },
    {
      $group: {
        _id: '$answers.question',
        attempts: { $sum: 1 },
        correct: { $sum: { $cond: ['$answers.isCorrect', 1, 0] } },
      },
    },
  ]);
  const statByQuestion = new Map(attemptStats.map((s) => [String(s._id), s]));

  const issueCounts = await QuestionIssueReport.aggregate([
    { $match: { question: { $in: questionIds }, status: 'open' } },
    { $group: { _id: '$question', count: { $sum: 1 } } },
  ]);
  const issuesByQuestion = new Map(issueCounts.map((s) => [String(s._id), s.count]));

  return questions.map((q) => {
    const stat = statByQuestion.get(String(q._id));
    const attempts = stat?.attempts ?? 0;
    const correct = stat?.correct ?? 0;
    return {
      question: q._id,
      text: q.text,
      attempts,
      correctRatePercent: attempts === 0 ? null : Math.round((correct / attempts) * 100),
      openIssueCount: issuesByQuestion.get(String(q._id)) ?? 0,
    };
  });
}

// UC-QBK-13: flags same-concept active questions whose normalized text matches exactly — a cheap,
// deterministic heuristic; upgrade: embedding-similarity search once that infra exists.
async function findDuplicates({ concept }) {
  const filter = { status: 'active', ...(concept ? { concept } : {}) };
  const questions = await QuestionItem.find(filter).select('_id text concept');
  const groups = new Map();
  questions.forEach((q) => {
    const key = `${q.concept}::${normalizeForDuplicateCheck(q.text)}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ id: q._id, text: q.text });
  });
  return [...groups.values()].filter((group) => group.length > 1);
}

async function previewRegradeImpact(id) {
  await getRaw(id);
  return assessmentService.previewRegradeImpact(id);
}

async function confirmRegrade(id, adminId) {
  await getRaw(id);
  return assessmentService.regradeAffected(id, adminId);
}

module.exports = {
  create,
  list,
  getById,
  getRaw,
  update,
  duplicate,
  updateStatus,
  remove,
  importBulk,
  exportAll,
  approveFromAiDraft,
  reportIssue,
  listIssueReports,
  resolveIssueReport,
  qualityStats,
  findDuplicates,
  previewRegradeImpact,
  confirmRegrade,
};
