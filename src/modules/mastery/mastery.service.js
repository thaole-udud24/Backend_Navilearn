const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const MasteryItem = require('./mastery.model');

// EMA weighting: recent attempts move the score but one bad attempt can't erase a track record.
const EMA_WEIGHT_NEW = 0.4;

function deriveLevel(score) {
  if (score >= 90) return 'mastered';
  if (score >= 70) return 'proficient';
  if (score >= 40) return 'developing';
  return 'novice';
}

async function listForOwner(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { owner: ownerId, ...(query.concept ? { concept: query.concept } : {}) };
  const [items, total] = await Promise.all([
    MasteryItem.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit).populate('concept', 'name'),
    MasteryItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getOwned(id, requester) {
  const item = await MasteryItem.findById(id).populate('concept', 'name');
  if (!item) throw ApiError.notFound('Mastery record not found');
  if (String(item.owner) !== String(requester.id)) throw ApiError.forbidden('Not the owner of this record');
  return item;
}

// Called by assessment.service right after an attempt is graded.
async function upsertForAttempt(ownerId, conceptId, attemptScorePercent) {
  let item = await MasteryItem.findOne({ owner: ownerId, concept: conceptId });
  const isCorrectAttempt = attemptScorePercent >= 50;

  if (!item) {
    item = new MasteryItem({
      owner: ownerId,
      concept: conceptId,
      score: attemptScorePercent,
      level: deriveLevel(attemptScorePercent),
      attemptsCount: 1,
      correctCount: isCorrectAttempt ? 1 : 0,
      lastAttemptAt: new Date(),
      createdBy: ownerId,
    });
  } else {
    item.score = Math.round(item.score * (1 - EMA_WEIGHT_NEW) + attemptScorePercent * EMA_WEIGHT_NEW);
    item.level = deriveLevel(item.score);
    item.attemptsCount += 1;
    item.correctCount += isCorrectAttempt ? 1 : 0;
    item.lastAttemptAt = new Date();
    item.updatedBy = ownerId;
  }

  await item.save();
  return item;
}

module.exports = { listForOwner, getOwned, upsertForAttempt, deriveLevel };
