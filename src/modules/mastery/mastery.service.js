const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const MasteryItem = require('./mastery.model');
const businessRuleService = require('../business-rule/business-rule.service');

// EMA weighting: recent attempts move the score but one bad attempt can't erase a track record.
const EMA_WEIGHT_NEW = 0.4;

// Pure fallback used when no thresholds have been configured yet (BRL-10) or by callers (e.g. unit
// tests) that don't want to hit the DB.
function deriveLevel(score, thresholds) {
  const t = thresholds ?? businessRuleService.DEFAULT_THRESHOLDS;
  if (score >= t['mastery.mastered']) return 'mastered';
  if (score >= t['mastery.proficient']) return 'proficient';
  if (score >= t['mastery.developing']) return 'developing';
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

// Internal lookup for other modules (e.g. ai-assist personalization) — no ownership error, just null.
async function findRaw(ownerId, conceptId) {
  return MasteryItem.findOne({ owner: ownerId, concept: conceptId });
}

// Called by assessment.service right after an attempt is graded (initial_grading) or a question
// changes and affected attempts are regraded (regrade). Always appends to history (UC-AP-MST-04).
async function upsertForAttempt(ownerId, conceptId, attemptScorePercent, reason = 'initial_grading') {
  const thresholds = await businessRuleService.getThresholds();
  let item = await MasteryItem.findOne({ owner: ownerId, concept: conceptId });
  const isCorrectAttempt = attemptScorePercent >= 50;

  if (!item) {
    const level = deriveLevel(attemptScorePercent, thresholds);
    item = new MasteryItem({
      owner: ownerId,
      concept: conceptId,
      score: attemptScorePercent,
      level,
      attemptsCount: 1,
      correctCount: isCorrectAttempt ? 1 : 0,
      lastAttemptAt: new Date(),
      createdBy: ownerId,
      history: [{ score: attemptScorePercent, level, reason }],
    });
  } else {
    item.score = Math.round(item.score * (1 - EMA_WEIGHT_NEW) + attemptScorePercent * EMA_WEIGHT_NEW);
    item.level = deriveLevel(item.score, thresholds);
    item.attemptsCount += 1;
    item.correctCount += isCorrectAttempt ? 1 : 0;
    item.lastAttemptAt = new Date();
    item.updatedBy = ownerId;
    item.history.push({ score: item.score, level: item.level, reason });
  }

  await item.save();
  return item;
}

// UC-AP-MST-02: seeds Learning State/Mastery right after a placement test, one entry per concept
// the placement test covered.
async function initializeFromPlacement(ownerId, conceptScores) {
  const thresholds = await businessRuleService.getThresholds();
  const created = [];
  for (const { concept, scorePercent } of conceptScores) {
    // eslint-disable-next-line no-await-in-loop
    const existing = await MasteryItem.findOne({ owner: ownerId, concept });
    if (existing) continue; // don't overwrite an already-tracked concept
    const level = deriveLevel(scorePercent, thresholds);
    // eslint-disable-next-line no-await-in-loop
    const item = await MasteryItem.create({
      owner: ownerId,
      concept,
      score: scorePercent,
      level,
      attemptsCount: 1,
      correctCount: scorePercent >= 50 ? 1 : 0,
      lastAttemptAt: new Date(),
      createdBy: ownerId,
      history: [{ score: scorePercent, level, reason: 'placement_init' }],
    });
    created.push(item);
  }
  return created;
}

// UC-MST-05
async function getTrend(id, requester, { from, to } = {}) {
  const item = await getOwned(id, requester);
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  const points = item.history.filter((h) => (!fromDate || h.at >= fromDate) && (!toDate || h.at <= toDate));
  return { concept: item.concept, points };
}

// UC-MST-06
async function setGoal(id, requester, goalScore) {
  const item = await getOwned(id, requester);
  item.goalScore = goalScore;
  item.updatedBy = requester.id;
  await item.save();
  return item;
}

// UC-MST-07: find-or-create so completing content doesn't require an assessment attempt first.
async function markContentComplete(ownerId, conceptId, contentRef) {
  const thresholds = await businessRuleService.getThresholds();
  let item = await MasteryItem.findOne({ owner: ownerId, concept: conceptId });
  if (!item) {
    item = new MasteryItem({
      owner: ownerId,
      concept: conceptId,
      score: 0,
      level: deriveLevel(0, thresholds),
      createdBy: ownerId,
    });
  }
  item.completedContent.push({ contentRef });
  item.history.push({ score: item.score, level: item.level, reason: 'content_completed' });
  item.updatedBy = ownerId;
  await item.save();
  return item;
}

// UC-MST-08
async function exportReport(ownerId, { concept, from, to } = {}) {
  const filter = { owner: ownerId, ...(concept ? { concept } : {}) };
  const items = await MasteryItem.find(filter).populate('concept', 'name');
  const fromDate = from ? new Date(from) : null;
  const toDate = to ? new Date(to) : null;
  return items.map((item) => ({
    concept: item.concept,
    score: item.score,
    level: item.level,
    attemptsCount: item.attemptsCount,
    goalScore: item.goalScore,
    history: item.history.filter((h) => (!fromDate || h.at >= fromDate) && (!toDate || h.at <= toDate)),
  }));
}

module.exports = {
  listForOwner,
  getOwned,
  findRaw,
  upsertForAttempt,
  initializeFromPlacement,
  getTrend,
  setGoal,
  markContentComplete,
  exportReport,
  deriveLevel,
};
