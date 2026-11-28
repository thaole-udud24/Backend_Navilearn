const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const MasteryItem = require('./mastery.model');
const businessRuleService = require('../business-rule/business-rule.service');
const { resolveSubjectConceptIds } = require('../../shared/subjectFilter');

// BR-38: Mastery = Σ(w×s)/Σw over evidence; w = w_loại_bài × w_mức_AI × w_thời_gian.
const TYPE_WEIGHT = {
  placement: 0.5,
  practice: 0.7,
  chapter_test: 1.0,
  mock_exam: 1.0,
  independent_check: 1.2,
};
const AI_LEVEL_WEIGHT = [1.0, 0.9, 0.7, 0.4, 0.1];
const TIME_DECAY_HALF_LIFE_DAYS = 30;

// shortcut: no module yet records a per-attempt AI-help level (AIA/AIC scope), so evidence without
// one defaults to aiLevel 0 (w_mức_AI = 1.0, i.e. "no AI help assumed"); upgrade once that pipeline exists.
function evidenceWeight({ evidenceType, aiLevel, at }) {
  const typeWeight = TYPE_WEIGHT[evidenceType] ?? TYPE_WEIGHT.practice;
  const aiWeight = AI_LEVEL_WEIGHT[aiLevel ?? 0] ?? AI_LEVEL_WEIGHT[0];
  const days = (Date.now() - new Date(at).getTime()) / (1000 * 60 * 60 * 24);
  const timeWeight = 0.5 ** (Math.max(days, 0) / TIME_DECAY_HALF_LIFE_DAYS);
  return typeWeight * aiWeight * timeWeight;
}

// BR-38: weighted average over the score evidence only — 'content_completed' entries carry no
// "tỷ lệ đúng" and are excluded.
function computeWeightedScore(history) {
  const evidence = history.filter((h) => h.reason !== 'content_completed');
  if (evidence.length === 0) return 0;
  let weightedSum = 0;
  let weightTotal = 0;
  for (const h of evidence) {
    const w = evidenceWeight(h);
    weightedSum += w * h.score;
    weightTotal += w;
  }
  return weightTotal === 0 ? 0 : Math.round(weightedSum / weightTotal);
}

// Pure fallback used when no thresholds have been configured yet (BRL-10) or by callers (e.g. unit
// tests) that don't want to hit the DB.
function deriveLevel(score, thresholds) {
  const t = thresholds ?? businessRuleService.DEFAULT_THRESHOLDS;
  if (score >= t['mastery.mastered']) return 'mastered';
  if (score >= t['mastery.proficient']) return 'proficient';
  if (score >= t['mastery.developing']) return 'developing';
  return 'novice';
}

// BR-38: "không cập nhật [Mastery] từ một lần làm bài đơn lẻ" — the exact count is left to the
// project team to decide (BRD §1.5), so score/attempts still accumulate from attempt 1, but the
// derived level stays 'novice' (not yet a confident reading) until this many attempts exist.
const MIN_ATTEMPTS_FOR_LEVEL = 3;

function levelFor(score, attemptsCount, thresholds) {
  return attemptsCount < MIN_ATTEMPTS_FOR_LEVEL ? 'novice' : deriveLevel(score, thresholds);
}

const DECAY_DAYS = 14;
const DECAY_SCORE_FLOOR = 60;

// BR-39: transition Learning State for the attempt that was just graded. `evidenceCount` is used as
// the proxy for "ít nhất 2 bằng chứng" (attemptsCount after this attempt is applied by the caller).
// `aiLevel` defaults to 0 (see evidenceWeight) so "mức AI không quá 1" holds until AI-help tracking exists.
function nextLearningStateForAttempt(currentState, { score, evidenceCount, independentCheck, aiLevel = 0 }) {
  let state = currentState === 'DECAY_RISK' ? 'PRACTICING' : currentState; // "ôn lại" thoát DECAY_RISK
  if (state === 'LEARNING') state = 'PRACTICING'; // làm bài luyện tập đầu tiên
  if (state === 'PRACTICING' && score >= 70 && evidenceCount >= 2 && aiLevel <= 1) state = 'UNDERSTOOD';
  if (independentCheck && state === 'UNDERSTOOD' && score >= 80) state = 'APPLIED';
  return state;
}

// Trạng thái hiển thị: không mutate DB từ đường đọc, chỉ tính "đang có nguy cơ DECAY_RISK ngay lúc
// này" dựa trên lastAttemptAt/score, để UI phản ánh đúng mà không cần job nền.
// `decayDays` defaults to the hardcoded constant above for existing callers; risk.service passes
// the Admin-configured BR-17-RETENTION-RISK value instead (B14) so the same decay rule drives both
// the Learning-State display and the N9 "sắp đứt chuỗi học" warning from one real threshold.
function computeDisplayState(item, decayDays = DECAY_DAYS) {
  const isEligibleForDecay = ['PRACTICING', 'UNDERSTOOD', 'APPLIED'].includes(item.learningState);
  if (!isEligibleForDecay) return item.learningState;
  const daysSinceLastAttempt = item.lastAttemptAt
    ? (Date.now() - new Date(item.lastAttemptAt).getTime()) / (1000 * 60 * 60 * 24)
    : Infinity;
  if (daysSinceLastAttempt > decayDays || item.score < DECAY_SCORE_FLOOR) return 'DECAY_RISK';
  return item.learningState;
}

async function listForOwner(ownerId, query, requester) {
  const { page, limit, skip } = parsePagination(query);
  const subjectIds = await resolveSubjectConceptIds(query.subjectId, requester);
  const filter = { owner: ownerId };
  if (query.concept && subjectIds) {
    filter.concept = subjectIds.some((id) => String(id) === String(query.concept)) ? query.concept : null;
  } else if (query.concept) {
    filter.concept = query.concept;
  } else if (subjectIds) {
    filter.concept = { $in: subjectIds };
  }
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
// `evidenceType` is the assessment kind (BR-38 w_loại_bài); `aiLevel` the AI-help level 0-4 for
// this attempt (defaults to 0 — see evidenceWeight).
async function upsertForAttempt(
  ownerId,
  conceptId,
  attemptScorePercent,
  reason = 'initial_grading',
  { independentCheck = false, evidenceType = 'practice', aiLevel = 0 } = {},
) {
  const thresholds = await businessRuleService.getThresholds();
  let item = await MasteryItem.findOne({ owner: ownerId, concept: conceptId });
  const isCorrectAttempt = attemptScorePercent >= 50;
  const newEntry = { score: attemptScorePercent, reason, evidenceType, aiLevel, at: new Date() };

  if (!item) {
    const weightedScore = computeWeightedScore([newEntry]);
    const level = levelFor(weightedScore, 1, thresholds);
    const learningState = nextLearningStateForAttempt('LEARNING', {
      score: weightedScore,
      evidenceCount: 1,
      independentCheck,
      aiLevel,
    });
    item = new MasteryItem({
      owner: ownerId,
      concept: conceptId,
      score: weightedScore,
      level,
      learningState,
      attemptsCount: 1,
      correctCount: isCorrectAttempt ? 1 : 0,
      lastAttemptAt: new Date(),
      createdBy: ownerId,
      history: [{ ...newEntry, level }],
    });
  } else {
    item.history.push({ ...newEntry, level: item.level });
    item.score = computeWeightedScore(item.history);
    item.attemptsCount += 1;
    item.level = levelFor(item.score, item.attemptsCount, thresholds);
    item.learningState = nextLearningStateForAttempt(item.learningState, {
      score: item.score,
      evidenceCount: item.attemptsCount,
      independentCheck,
      aiLevel,
    });
    item.correctCount += isCorrectAttempt ? 1 : 0;
    item.lastAttemptAt = new Date();
    item.updatedBy = ownerId;
    item.history[item.history.length - 1].level = item.level;
  }

  await item.save();
  return item;
}

// BR-39: NOT_SEEN→LEARNING khi sinh viên mở nội dung lần đầu. Idempotent - không hạ cấp trạng thái
// đã tiến xa hơn (PRACTICING trở lên) nếu gọi lại.
async function openContent(ownerId, conceptId) {
  const existing = await MasteryItem.findOne({ owner: ownerId, concept: conceptId });
  if (existing) return existing;
  return MasteryItem.create({
    owner: ownerId,
    concept: conceptId,
    score: 0,
    level: 'novice',
    learningState: 'LEARNING',
    createdBy: ownerId,
  });
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
    const weightedScore = computeWeightedScore([{ score: scorePercent, evidenceType: 'placement', aiLevel: 0, at: new Date(), reason: 'placement_init' }]);
    const level = deriveLevel(weightedScore, thresholds);
    // BR-39: "Sau bài đầu vào: đúng từ 50% vào PRACTICING, thấp hơn vào LEARNING".
    const learningState = scorePercent >= 50 ? 'PRACTICING' : 'LEARNING';
    // eslint-disable-next-line no-await-in-loop
    const item = await MasteryItem.create({
      owner: ownerId,
      concept,
      score: weightedScore,
      level,
      learningState,
      attemptsCount: 1,
      correctCount: scorePercent >= 50 ? 1 : 0,
      lastAttemptAt: new Date(),
      createdBy: ownerId,
      history: [{ score: scorePercent, level, reason: 'placement_init', evidenceType: 'placement', aiLevel: 0 }],
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
    learningState: computeDisplayState(item),
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
  openContent,
  initializeFromPlacement,
  getTrend,
  setGoal,
  markContentComplete,
  exportReport,
  deriveLevel,
  computeDisplayState,
  nextLearningStateForAttempt,
  computeWeightedScore,
};
