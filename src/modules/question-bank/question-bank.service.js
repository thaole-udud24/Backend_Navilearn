const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const QuestionItem = require('./question-bank.model');
const Concept = require('../knowledge/knowledge.model');
const { ROLES } = require('../../shared/roles');

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
    // Non-admins are always forced to 'active', ignoring any status they ask for — only admins
    // may pass their own status filter (or none, to see every status).
    status: requester.role === ROLES.ADMIN ? query.status : 'active',
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

async function updateStatus(id, requesterId, status) {
  const item = await QuestionItem.findById(id);
  if (!item) throw ApiError.notFound('Question not found');
  item.status = status;
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

async function remove(id) {
  const item = await QuestionItem.findById(id);
  if (!item) throw ApiError.notFound('Question not found');
  await item.softDelete();
}

module.exports = { create, list, getById, updateStatus, remove };
