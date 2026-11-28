const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { resolveSubjectConceptIds } = require('../../shared/subjectFilter');
const WrongItem = require('./wrong-item.model');

// Called from assessment.service right after grading, once per question the student got wrong.
// Upsert so repeat misses accumulate on the same row instead of duplicating (unique owner+question).
async function recordWrong(ownerId, questionId, conceptId) {
  let item = await WrongItem.findOne({ owner: ownerId, question: questionId });
  if (!item) {
    return WrongItem.create({
      owner: ownerId,
      createdBy: ownerId,
      question: questionId,
      concept: conceptId,
      wrongCount: 1,
      lastWrongAt: new Date(),
      status: 'open',
    });
  }
  item.wrongCount += 1;
  item.lastWrongAt = new Date();
  item.status = 'open'; // a repeat miss un-masters it
  item.updatedBy = ownerId;
  await item.save();
  return item;
}

// Called when a question that was wrong gets answered correctly on a retry — nothing to do if the
// student never missed it.
async function markMastered(ownerId, questionId) {
  return WrongItem.findOneAndUpdate(
    { owner: ownerId, question: questionId },
    { status: 'mastered', updatedBy: ownerId },
  );
}

async function getOwnedRaw(id, requesterId) {
  const item = await WrongItem.findById(id);
  if (!item) throw ApiError.notFound('Wrong item not found');
  if (String(item.owner) !== String(requesterId)) throw ApiError.forbidden('Not the owner of this record');
  return item;
}

async function list(ownerId, query, requester) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {
    owner: ownerId,
    ...(query.status ? { status: query.status } : {}),
  };
  const subjectIds = await resolveSubjectConceptIds(query.subjectId || query.subject, requester);
  if (query.concept && subjectIds) {
    filter.concept = subjectIds.some((id) => String(id) === String(query.concept)) ? query.concept : null;
  } else if (query.concept) {
    filter.concept = query.concept;
  } else if (subjectIds) {
    filter.concept = { $in: subjectIds };
  }
  const [items, total] = await Promise.all([
    WrongItem.find(filter)
      .sort({ lastWrongAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('question', 'text type explanation options')
      .populate('concept', 'name'),
    WrongItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

// Feeds AssessmentItem.questionsOverride for a "retry my wrong questions" practice session.
async function buildRetryQuestionIds(ownerId, { concept, limit } = {}) {
  const filter = { owner: ownerId, status: 'open', ...(concept ? { concept } : {}) };
  const items = await WrongItem.find(filter)
    .sort({ lastWrongAt: -1 })
    .limit(limit || 50)
    .select('question');
  return items.map((i) => i.question);
}

async function markMasteredById(id, requesterId) {
  const item = await getOwnedRaw(id, requesterId);
  item.status = 'mastered';
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

// Partial-selection retry (N2): unlike buildRetryQuestionIds (every open item for a concept), this
// scopes to the exact wrongItemIds the student checked in the Sổ câu sai table. All picked items
// must be open, owned, and share one concept — AssessmentItem.concept is a single required field,
// so a mixed-concept selection can't become one attempt.
async function getQuestionIdsForRetry(ownerId, wrongItemIds) {
  const items = await WrongItem.find({ _id: { $in: wrongItemIds }, owner: ownerId, status: 'open' });
  if (items.length !== wrongItemIds.length) {
    throw ApiError.badRequest('Một số câu đã chọn không hợp lệ hoặc đã được xử lý', 'INVALID_WRONG_ITEMS');
  }
  const conceptIds = [...new Set(items.map((i) => String(i.concept)))];
  if (conceptIds.length > 1) {
    throw ApiError.badRequest('Chỉ có thể chọn các câu cùng một kiến thức trong một lượt luyện lại', 'MULTI_CONCEPT_SELECTION');
  }
  return { concept: conceptIds[0], questionIds: items.map((i) => i.question) };
}

module.exports = {
  recordWrong,
  markMastered,
  markMasteredById,
  list,
  buildRetryQuestionIds,
  getQuestionIdsForRetry,
  getOwnedRaw,
};
