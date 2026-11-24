const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const LessonItem = require('./lesson.model');
const Concept = require('../knowledge/knowledge.model');
const QuestionItem = require('../question-bank/question-bank.model');

async function assertConceptExists(conceptId) {
  const exists = await Concept.exists({ _id: conceptId });
  if (!exists) throw ApiError.badRequest('Concept not found', 'CONCEPT_NOT_FOUND');
}

// Same reuse pattern as plan-template/assessment-config: a bad question id would otherwise only
// surface later, when some lộ trình references this lesson's questions.
async function assertQuestionsBelongToConcept(conceptId, questionIds) {
  const uniqueIds = [...new Set(questionIds ?? [])];
  if (uniqueIds.length === 0) return;
  const questions = await QuestionItem.find({ _id: { $in: uniqueIds } });
  if (questions.length !== uniqueIds.length) {
    throw ApiError.badRequest('Một số câu hỏi không tồn tại', 'QUESTION_NOT_FOUND');
  }
  if (questions.some((q) => String(q.concept) !== String(conceptId))) {
    throw ApiError.badRequest('Tất cả câu hỏi phải thuộc đúng kiến thức của bài học', 'QUESTION_CONCEPT_MISMATCH');
  }
}

async function list(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {
    ...(query.concept ? { concept: query.concept } : {}),
    ...(query.status ? { status: query.status } : {}),
  };
  const [items, total] = await Promise.all([
    LessonItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('concept', 'name'),
    LessonItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const item = await LessonItem.findById(id).populate('concept', 'name');
  if (!item) throw ApiError.notFound('Lesson not found');
  return item;
}

async function create(requesterId, data) {
  await assertConceptExists(data.concept);
  await assertQuestionsBelongToConcept(data.concept, data.questions);
  return LessonItem.create({ ...data, createdBy: requesterId });
}

async function update(id, requesterId, data) {
  const item = await getById(id);
  const effectiveConcept = data.concept ?? (item.concept?._id ?? item.concept);
  if (data.concept) await assertConceptExists(data.concept);
  if (data.questions) await assertQuestionsBelongToConcept(effectiveConcept, data.questions);
  Object.assign(item, data, { updatedBy: requesterId });
  await item.save();
  return item;
}

async function remove(id, requesterId) {
  const item = await getById(id);
  item.updatedBy = requesterId;
  await item.softDelete();
}

async function publish(id, requesterId) {
  const item = await getById(id);
  item.status = 'published';
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

async function archive(id, requesterId) {
  const item = await getById(id);
  item.status = 'archived';
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

module.exports = { list, getById, create, update, remove, publish, archive };
