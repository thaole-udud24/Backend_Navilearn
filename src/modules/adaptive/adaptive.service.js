const ApiError = require('../../utils/ApiError');
const masteryService = require('../mastery/mastery.service');
const planningService = require('../planning/planning.service');
const accountMeService = require('../account/account.me.service');
const AdaptiveActivity = require('./adaptive.model');
const { rankActivities, computePriority, buildActivity, explain } = require('./adaptive.priority');
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const MAX_SEARCH_DAYS = 60;

const FIRST_PAGE = { limit: '100' }; // shortcut: only the first 100 mastery records / goals are considered

async function loadActivities(ownerId, now) {
  const [{ items: masteries }, { items: goals }] = await Promise.all([
    masteryService.listForOwner(ownerId, FIRST_PAGE),
    planningService.listGoals(ownerId, FIRST_PAGE),
  ]);

  const byConcept = new Map();
  const slot = (c) => {
    const id = String(c._id);
    if (!byConcept.has(id)) byConcept.set(id, { id, name: c.name });
    return byConcept.get(id);
  };
  masteries
    .filter((m) => m.concept)
    .forEach((m) => {
      slot(m.concept).mastery = m;
    });
  // goals come sorted by deadline asc, so the nearest goal of a concept wins
  goals
    .filter((g) => g.concept)
    .forEach((g) => {
      const s = slot(g.concept);
      if (!s.goal) s.goal = g;
    });

  return [...byConcept.values()].map((c) => buildActivity(c, now));
}

// AP-ADP-01: pick the highest-priority concept (BR-40) and say why (BR-12).
async function nextBestAction(ownerId, now = new Date()) {
  const ranked = rankActivities(await loadActivities(ownerId, now));
  if (!ranked.length) return null;
  const top = ranked[0];
  return { concept: { id: top.id, name: top.name }, priority: top.priority, reason: explain(top) };
}

// UC-ADP-02: the student starts the current recommendation; we record it so the client can open the matching activity.
async function startNextBestAction(ownerId, now = new Date()) {
  const action = await nextBestAction(ownerId, now);
  if (!action) throw ApiError.conflict('No current recommendation to start');
  const activity = await AdaptiveActivity.create({
    owner: ownerId,
    createdBy: ownerId,
    concept: action.concept.id,
    priority: action.priority,
    reason: action.reason,
  });
  return { activity, concept: action.concept };
}

async function getActivePlan(ownerId, planId) {
  const plan = await planningService.getOwned(planId, { id: ownerId });
  if (plan.status !== 'active') throw ApiError.conflict('Plan is not active');
  return plan;
}

const unfinished = (plan) => plan.sessions.filter((s) => s.status !== 'done' && s.status !== 'cancelled');
const missedSessions = (plan, now) =>
  unfinished(plan).filter((s) => s.status === 'missed' || s.startAt < now);

// BR-11: không xếp phiên vào ngày có số phút khả dụng nhỏ hơn thời lượng phiên.
// shortcut: availability toàn 0 coi như chưa đặt (không giới hạn); mỗi ngày tối đa một phiên.
function firstFittingDay(from, durationMin, availability) {
  const unlimited = !Object.values(availability).some((m) => m > 0);
  const day = new Date(from);
  for (let i = 0; i < MAX_SEARCH_DAYS; i += 1, day.setUTCDate(day.getUTCDate() + 1)) {
    if (unlimited || availability[WEEKDAYS[day.getUTCDay()]] >= durationMin) return day;
  }
  throw ApiError.conflict('Available study time is too short to reschedule the remaining sessions');
}
// AP-ADP-02: does this plan need replanning? shortcut: only missed sessions are detected;
// poor results and study-time changes need event data that does not exist yet.
async function checkReplan(ownerId, planId, now = new Date()) {
  const plan = await getActivePlan(ownerId, planId);
  const missed = missedSessions(plan, now);
  return { needed: missed.length > 0, missedCount: missed.length };
}

// AP-ADP-03: re-rank the unfinished sessions of a plan by BR-40 priority (BR-13) and propose a new plan.
// The old plan stays active until the student confirms the proposal (BR-37/BR-54).
// Phiên giữ nguyên nội dung và giờ trong ngày ban đầu, mỗi ngày một phiên, bắt đầu từ ngày mai.
async function replan(ownerId, planId, now = new Date()) {
  const plan = await getActivePlan(ownerId, planId);
  const missed = missedSessions(plan, now);
  if (!missed.length) throw ApiError.conflict('No missed sessions to replan');
  const pending = unfinished(plan);
  const byId = new Map((await loadActivities(ownerId, now)).map((a) => [a.id, a]));
  const priorityOf = (s) =>
    computePriority(byId.get(String(s.concept)) || buildActivity({ id: String(s.concept) }, now));

  const { availability } = await accountMeService.getProfile(ownerId);
  let cursor = new Date(now);
  cursor.setUTCDate(cursor.getUTCDate() + 1);

  const sessions = pending
    .map((s) => ({ s, p: priorityOf(s) }))
    .sort((x, y) => y.p - x.p)
    .map(({ s }) => {
      const startAt = firstFittingDay(cursor, s.durationMin, availability);
      cursor = new Date(startAt);
      cursor.setUTCDate(cursor.getUTCDate() + 1);
      startAt.setUTCHours(s.startAt.getUTCHours(), s.startAt.getUTCMinutes(), 0, 0);
      const { concept, durationMin, title, chapterTitle, objectives, theoryContent, questions, quizPassed } = s;
      return { concept, startAt, durationMin, title, chapterTitle, objectives, theoryContent, questions, quizPassed };

    });

  const reason = `${missed.length} phiên bị bỏ lỡ; ${sessions.length} phiên chưa học được xếp lại theo mức ưu tiên, mỗi ngày một phiên trong thời gian khả dụng, bắt đầu từ ngày mai`;
  const proposed = await planningService.create(ownerId, {
    title: `${plan.title} (điều chỉnh)`,
    status: 'proposed',
    replaces: plan._id,
    reason,
    sessions,
  });  
  // BR-54: đề xuất mới thay thế đề xuất đang chờ của cùng plan, không để chồng chất.
  await planningService.supersedeProposals(ownerId, plan._id, proposed._id);

  return { plan: proposed, reason };
}

module.exports = { nextBestAction, startNextBestAction, checkReplan, replan };
