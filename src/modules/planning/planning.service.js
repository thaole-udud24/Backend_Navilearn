const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const PlanningItem = require('./planning.model');
const PlanningGoal = require('./planning.goal.model');
const QuestionItem = require('../question-bank/question-bank.model');

const QUIZ_PASS_SCORE = 70;

// Chặng (stage) lock/unlock, derived — never persisted — from the sessions already stored, sorted
// chronologically: the first session is always open; each later one unlocks once the one before it
// is resolved (done, cancelled or missed all count — a missed/cancelled session must not permanently
// block the rest of the roadmap). Returns sessionId -> 'locked' | 'available' | 'completed'.
function stageStatusMap(sessions) {
  const ordered = [...sessions].sort((a, b) => new Date(a.startAt) - new Date(b.startAt));
  let previousResolved = true;
  const map = new Map();
  for (const s of ordered) {
    const stageStatus = s.status === 'done' ? 'completed' : previousResolved ? 'available' : 'locked';
    map.set(String(s._id), stageStatus);
    previousResolved = s.status !== 'planned';
  }
  return map;
}

// Attaches the derived `stageStatus` to a plan's sessions right before it leaves the service layer —
// callers that still need to .save() the Mongoose document must do so BEFORE calling this.
function withStageStatus(item) {
  const plain = item.toObject ? item.toObject() : item;
  const statusById = stageStatusMap(plain.sessions ?? []);
  plain.sessions = (plain.sessions ?? []).map((s) => ({
    ...s,
    stageStatus: statusById.get(String(s._id)),
  }));
  return plain;
}

async function create(ownerId, data) {
  const item = await PlanningItem.create({ owner: ownerId, createdBy: ownerId, ...data });
  return withStageStatus(item);
}

async function listForOwner(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {
    owner: ownerId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.concept ? { 'sessions.concept': query.concept } : {}),
  };
  const [items, total] = await Promise.all([
    PlanningItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    PlanningItem.countDocuments(filter),
  ]);
  return { items: items.map(withStageStatus), meta: buildMeta(page, limit, total) };
}

// Personal learning data (BR-02/BR-35): owner only, admin gets no access.
async function getOwned(id, requester) {
  const item = await PlanningItem.findById(id);
  if (!item) throw ApiError.notFound('Plan not found');
  if (String(item.owner) !== String(requester.id)) throw ApiError.forbidden('Not the owner of this plan');
  return item;
}

async function getOwnedForResponse(id, requester) {
  return withStageStatus(await getOwned(id, requester));
}

async function confirm(id, requester) {
  const item = await getOwned(id, requester);
  if (item.status !== 'proposed') throw ApiError.conflict('Plan is not awaiting confirmation');
  item.status = 'active';
  item.updatedBy = requester.id;
  await item.save();
  if (item.replaces)
    await PlanningItem.updateOne({ _id: item.replaces, owner: item.owner }, { status: 'superseded' });
  return withStageStatus(item);
}
// BR-54: chỉ giữ đề xuất chờ xác nhận mới nhất của một plan.
async function supersedeProposals(ownerId, planId, keepId) {
  await PlanningItem.updateMany(
    { owner: ownerId, replaces: planId, status: 'proposed', _id: { $ne: keepId } },
    { status: 'superseded' },
  );
}

// A planned session whose start has passed counts as missed (same rule as ADP's missedSessions).
const effectiveStatus = (s, now) => (s.status === 'planned' && s.startAt < now ? 'missed' : s.status);

// UC-PLN-01/02: sessions of the student's active plans, flat and sorted, for calendar and history views.
// shortcut: not paginated and not filterable by subject; a calendar needs the whole window.
async function listSessions(ownerId, { from, to, status }, now = new Date()) {
  const plans = await PlanningItem.find({ owner: ownerId, status: 'active' });
  return plans
    .flatMap((p) =>
      p.sessions.map((s) => ({
        id: s._id,
        planId: p._id,
        planTitle: p.title,
        concept: s.concept,
        startAt: s.startAt,
        durationMin: s.durationMin,
        status: effectiveStatus(s, now),
        note: s.note,
      })),
    )
    .filter((s) => (!from || s.startAt >= from) && (!to || s.startAt < to) && (!status || s.status === status))
    .sort((a, b) => a.startAt - b.startAt);
}

async function getActive(id, requester) {
  const item = await getOwned(id, requester);
  if (item.status !== 'active') throw ApiError.conflict('Only an active plan can be edited');
  return item;
}

const endAt = (s) => new Date(new Date(s.startAt).getTime() + s.durationMin * 60000);

// UC-PLN-03/05: a session may not overlap another live session of the same plan.
// shortcut: checks one plan only, not the student's other plans; widen when plans can coexist.
function assertNoOverlap(item, candidate, selfId) {
  const clash = item.sessions.some(
    (s) =>
      String(s._id) !== String(selfId) &&
      s.status !== 'cancelled' &&
      new Date(s.startAt) < endAt(candidate) &&
      new Date(candidate.startAt) < endAt(s),
  );
  if (clash) throw ApiError.conflict('Session overlaps another session');
}

async function addSession(id, requester, data) {
  const item = await getActive(id, requester);
  assertNoOverlap(item, data);
  item.sessions.push(data);
  item.updatedBy = requester.id;
  await item.save();
  return withStageStatus(item);
}

async function updateSession(id, sessionId, requester, data) {
  const item = await getActive(id, requester);
  const session = item.sessions.find((s) => String(s._id) === sessionId);
  if (!session) throw ApiError.notFound('Session not found');
  const { status, note, ...timing } = data;
  const reschedules = Object.keys(timing).length > 0;
  // UC-PLN-05/06/07: only a scheduled session can be moved, cancelled or completed.
  if ((reschedules || status) && session.status !== 'planned')
    throw ApiError.conflict('Session is not scheduled');
  // Chặng (stage) gate, enforced server-side, not just hidden in the UI: can't complete a session
  // whose previous stage is still unresolved.
  if (status === 'done' && stageStatusMap(item.sessions).get(sessionId) === 'locked') {
    throw ApiError.conflict('Cần hoàn thành buổi học trước đó', 'STAGE_LOCKED');
  }
  // UC-PLN-04: notes are for sessions that are done (or being completed in this same request).
  if (note !== undefined && (status || session.status) !== 'done')
    throw ApiError.conflict('Session is not done');
  // UC-PLN-TPL-03: a session with an attached quiz can't be completed until it's passed.
  if (status === 'done' && (session.questions?.length ?? 0) > 0 && !session.quizPassed) {
    throw ApiError.conflict('Complete the attached quiz before marking this session done');
  }
  if (reschedules)
    assertNoOverlap(
      item,
      { startAt: session.startAt, durationMin: session.durationMin, ...timing },
      sessionId,
    );

  Object.assign(session, data);
  item.updatedBy = requester.id;
  await item.save();
  return withStageStatus(item);
}

// UC-PLN-TPL-03: grades the session's attached quiz with a simple pass/fail threshold; passing
// unlocks "done" for that session (see updateSession above).
async function submitSessionQuiz(id, sessionId, requester, answers) {
  const item = await getActive(id, requester);
  const session = item.sessions.find((s) => String(s._id) === sessionId);
  if (!session) throw ApiError.notFound('Session not found');
  if (!session.questions?.length) throw ApiError.conflict('This session has no quiz attached');
  if (stageStatusMap(item.sessions).get(sessionId) === 'locked') {
    throw ApiError.conflict('Cần hoàn thành buổi học trước đó', 'STAGE_LOCKED');
  }

  const questions = await QuestionItem.find({ _id: { $in: session.questions } });
  const correctCount = answers.reduce((count, { questionId, selectedOptionIndex }) => {
    const question = questions.find((q) => String(q._id) === questionId);
    return question?.options?.[selectedOptionIndex]?.isCorrect ? count + 1 : count;
  }, 0);
  const totalCount = questions.length;
  const scorePercent = totalCount ? Math.round((correctCount / totalCount) * 100) : 0;
  const passed = scorePercent >= QUIZ_PASS_SCORE;

  if (passed && !session.quizPassed) {
    session.quizPassed = true;
    item.updatedBy = requester.id;
    await item.save();
  }
  return { scorePercent, passed, correctCount, totalCount };
}

async function removeSession(id, sessionId, requester) {
  const item = await getActive(id, requester);
  if (!item.sessions.some((s) => String(s._id) === sessionId)) throw ApiError.notFound('Session not found');
  item.sessions = item.sessions.filter((s) => String(s._id) !== sessionId);
  item.updatedBy = requester.id;
  await item.save();
}

async function remove(id, requester) {
  const item = await getOwned(id, requester);
  await item.softDelete();
}

async function createGoal(ownerId, data) {
  return PlanningGoal.create({ owner: ownerId, createdBy: ownerId, ...data });
}

async function listGoals(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { owner: ownerId, ...(query.concept ? { concept: query.concept } : {}) };
  const [items, total] = await Promise.all([
    PlanningGoal.find(filter).sort({ deadline: 1 }).skip(skip).limit(limit).populate('concept', 'name'),
    PlanningGoal.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getOwnedGoal(id, requester) {
  const goal = await PlanningGoal.findById(id);
  if (!goal) throw ApiError.notFound('Goal not found');
  if (String(goal.owner) !== String(requester.id)) throw ApiError.forbidden('Not the owner of this goal');
  return goal;
}

async function updateGoal(id, requester, data) {
  const goal = await getOwnedGoal(id, requester);
  Object.assign(goal, data, { updatedBy: requester.id });
  await goal.save();
  return goal;
}

async function removeGoal(id, requester) {
  const goal = await getOwnedGoal(id, requester);
  await goal.softDelete();
}

module.exports = {
  create,
  listForOwner,
  listSessions,
  getOwned,
  getOwnedForResponse,
  confirm,
  supersedeProposals,
  addSession,
  updateSession,
  submitSessionQuiz,
  removeSession,
  remove,
  createGoal,
  listGoals,
  getOwnedGoal,
  updateGoal,
  removeGoal,
};
