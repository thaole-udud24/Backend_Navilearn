const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const AssessmentConfigItem = require('./assessment-config.model');
const Concept = require('../knowledge/knowledge.model');
const QuestionItem = require('../question-bank/question-bank.model');
const { ROLES } = require('../../shared/roles');

async function create(ownerId, data) {
  const concept = await Concept.findById(data.concept);
  if (!concept) throw ApiError.badRequest('Concept not found', 'CONCEPT_NOT_FOUND');

  const uniqueQuestionIds = [...new Set(data.questions)];
  const questions = await QuestionItem.find({ _id: { $in: uniqueQuestionIds } });
  if (questions.length !== uniqueQuestionIds.length) {
    throw ApiError.badRequest('Some questions were not found', 'QUESTION_NOT_FOUND');
  }
  if (questions.some((q) => String(q.concept) !== String(data.concept))) {
    throw ApiError.badRequest('All questions must belong to the selected concept', 'QUESTION_CONCEPT_MISMATCH');
  }

  return AssessmentConfigItem.create({ owner: ownerId, createdBy: ownerId, ...data });
}

async function list(query, requester) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {
    ...(query.concept ? { concept: query.concept } : {}),
    // Non-admins are always forced to 'active', ignoring any status they ask for — only admins
    // may pass their own status filter (or none, to see every status).
    status: requester.role === ROLES.ADMIN ? query.status : 'active',
  };
  if (filter.status === undefined) delete filter.status;
  const [items, total] = await Promise.all([
    AssessmentConfigItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    AssessmentConfigItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const item = await AssessmentConfigItem.findById(id);
  if (!item) throw ApiError.notFound('Assessment config not found');
  return item;
}

async function updateStatus(id, requesterId, status) {
  const item = await getById(id);
  item.status = status;
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

async function remove(id) {
  const item = await getById(id);
  await item.softDelete();
}

module.exports = { create, list, getById, updateStatus, remove };
