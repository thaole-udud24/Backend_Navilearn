const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const AssessmentConfigItem = require('./assessment-config.model');
const Concept = require('../knowledge/knowledge.model');
const QuestionItem = require('../question-bank/question-bank.model');
const { ROLES } = require('../../shared/roles');

async function create(ownerId, data) {
  const concept = await Concept.findById(data.concept);
  if (!concept) throw ApiError.badRequest('Concept not found', 'CONCEPT_NOT_FOUND');

  const questions = await QuestionItem.find({ _id: { $in: data.questions } });
  if (questions.length !== data.questions.length) {
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
    status: query.status ?? (requester.role === ROLES.ADMIN ? undefined : 'active'),
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
