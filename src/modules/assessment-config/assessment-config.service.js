const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const AssessmentConfigItem = require('./assessment-config.model');
const Rubric = require('./rubric.model');
const Concept = require('../knowledge/knowledge.model');
const QuestionItem = require('../question-bank/question-bank.model');
const { ROLES } = require('../../shared/roles');

const UPDATABLE_FIELDS = ['title', 'questions', 'passScore', 'timeLimitMinutes', 'kind'];

async function assertQuestionsBelongToConcept(conceptId, questionIds) {
  const uniqueQuestionIds = [...new Set(questionIds)];
  const questions = await QuestionItem.find({ _id: { $in: uniqueQuestionIds } });
  if (questions.length !== uniqueQuestionIds.length) {
    throw ApiError.badRequest('Some questions were not found', 'QUESTION_NOT_FOUND');
  }
  if (questions.some((q) => String(q.concept) !== String(conceptId))) {
    throw ApiError.badRequest(
      'All questions must belong to the selected concept',
      'QUESTION_CONCEPT_MISMATCH',
    );
  }
}

async function create(ownerId, data) {
  const concept = await Concept.findById(data.concept);
  if (!concept) throw ApiError.badRequest('Concept not found', 'CONCEPT_NOT_FOUND');
  await assertQuestionsBelongToConcept(data.concept, data.questions);
  return AssessmentConfigItem.create({ owner: ownerId, createdBy: ownerId, ...data });
}

async function list(query, requester) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {
    ...(query.concept ? { concept: query.concept } : {}),
    ...(query.kind ? { kind: query.kind } : {}),
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

async function update(id, requesterId, data) {
  const item = await getById(id);
  if (data.questions) {
    await assertQuestionsBelongToConcept(item.concept, data.questions);
  }
  UPDATABLE_FIELDS.forEach((field) => {
    if (data[field] !== undefined) item[field] = data[field];
  });
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

async function updatePolicy(id, requesterId, { retryPolicy, showAnswersPolicy }) {
  const item = await getById(id);
  if (retryPolicy) item.retryPolicy = { ...item.retryPolicy.toObject(), ...retryPolicy };
  if (showAnswersPolicy) item.showAnswersPolicy = showAnswersPolicy;
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

async function duplicate(id, ownerId) {
  const source = await getById(id);
  const plain = source.toObject();
  delete plain._id;
  delete plain.createdAt;
  delete plain.updatedAt;
  return AssessmentConfigItem.create({
    ...plain,
    owner: ownerId,
    createdBy: ownerId,
    updatedBy: null,
    title: `${plain.title} (copy)`,
  });
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

// ---- Rubrics (UC-ACF-07..10) ----

async function createRubric(ownerId, data) {
  const concept = await Concept.findById(data.concept);
  if (!concept) throw ApiError.badRequest('Concept not found', 'CONCEPT_NOT_FOUND');
  return Rubric.create({ owner: ownerId, createdBy: ownerId, ...data });
}

async function listRubrics(query, requester) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {
    ...(query.concept ? { concept: query.concept } : {}),
    status: requester.role === ROLES.ADMIN ? query.status : 'active',
  };
  if (filter.status === undefined) delete filter.status;
  const [items, total] = await Promise.all([
    Rubric.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Rubric.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getRubric(id) {
  const item = await Rubric.findById(id);
  if (!item) throw ApiError.notFound('Rubric not found');
  return item;
}

async function updateRubric(id, requesterId, data) {
  const item = await getRubric(id);
  if (data.title !== undefined) item.title = data.title;
  if (data.criteria !== undefined) item.criteria = data.criteria;
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

async function updateRubricStatus(id, requesterId, status) {
  const item = await getRubric(id);
  item.status = status;
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

// Used by ai-assist.service when grading an essay for a concept that has an active rubric.
async function findActiveRubricForConcept(conceptId) {
  return Rubric.findOne({ concept: conceptId, status: 'active' }).sort({ createdAt: -1 });
}

module.exports = {
  create,
  list,
  getById,
  update,
  updatePolicy,
  duplicate,
  updateStatus,
  remove,
  createRubric,
  listRubrics,
  getRubric,
  updateRubric,
  updateRubricStatus,
  findActiveRubricForConcept,
};
