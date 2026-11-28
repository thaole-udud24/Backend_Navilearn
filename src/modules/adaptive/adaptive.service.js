const ApiError = require('../../utils/ApiError');
const masteryService = require('../mastery/mastery.service');
const planningService = require('../planning/planning.service');
const notificationService = require('../notification/notification.service');
const AdaptiveActivity = require('./adaptive.model');
const { rankActivities, computePriority, buildActivity, explain } = require('./adaptive.priority');

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

// Practice Hub P4: full priority-ranked review queue (BR-40 + BR-12).
async function priorityQueue(ownerId, now = new Date()) {
  const ranked = rankActivities(await loadActivities(ownerId, now));
  return ranked.slice(0, 20).map((item) => ({
    concept: { id: item.id, name: item.name },
    priority: item.priority,
    reason: explain(item),
    masteryScore: item.mastery?.score ?? 0,
    learningState: item.mastery?.learningState ?? 'NOT_SEEN',
  }));
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

// AP-ADP-02: does this plan need replanning? shortcut: only missed sessions are detected;
// poor results and study-time changes need event data that does not exist yet.
async function checkReplan(ownerId, planId, now = new Date()) {
  const plan = await getActivePlan(ownerId, planId);
  const missed = missedSessions(plan, now);
  return { needed: missed.length > 0, missedCount: missed.length };
}

// AP-ADP-03: re-rank the unfinished sessions of a plan by BR-40 priority (BR-13) and propose a new plan.
// The old plan stays active until the student confirms the proposal (BR-37/BR-54).
// shortcut: no study-time data yet (BR-11), so the cap is one session per day starting tomorrow, at each session's original time of day.
async function replan(ownerId, planId, now = new Date()) {
  const plan = await getActivePlan(ownerId, planId);
  const missed = missedSessions(plan, now);
  if (!missed.length) throw ApiError.conflict('No missed sessions to replan');
  const pending = unfinished(plan);
  const byId = new Map((await loadActivities(ownerId, now)).map((a) => [a.id, a]));
  const priorityOf = (s) =>
    computePriority(byId.get(String(s.concept)) || buildActivity({ id: String(s.concept) }, now));

  const sessions = pending
    .map((s) => ({ s, p: priorityOf(s) }))
    .sort((x, y) => y.p - x.p)
    .map(({ s }, i) => {
      const startAt = new Date(now);
      startAt.setUTCDate(startAt.getUTCDate() + i + 1);
      startAt.setUTCHours(s.startAt.getUTCHours(), s.startAt.getUTCMinutes(), 0, 0);
      return { concept: s.concept, startAt, durationMin: s.durationMin };
    });

  const reason = `${missed.length} phiên bị bỏ lỡ; ${sessions.length} phiên chưa học được xếp lại theo mức ưu tiên, mỗi ngày một phiên, bắt đầu từ ngày mai`;
  const proposed = await planningService.create(ownerId, {
    title: `${plan.title} (điều chỉnh)`,
    status: 'proposed',
    replaces: plan._id,
    reason,
    // A replan is still for the same exam goal as the plan it supersedes — inherit the link rather
    // than losing it (the old plan may itself predate the goal field, hence the `?? null`).
    goal: plan.goal ?? null,
    sessions,
  });

  // N13/BR-13/UC-ADP-03: a replan proposal needs student review — a real, meaningful trigger to
  // notify about (not invented). Best-effort: a notification failure must not fail the replan itself.
  try {
    await notificationService.create(ownerId, {
      title: 'Kế hoạch học tập được đề xuất lại',
      content: reason,
      category: 'hoc_tap',
      link: '/student/goal-roadmap',
    });
  } catch {
    // shortcut: swallow — notifying is secondary to the replan succeeding.
  }

  return { plan: proposed, reason };
}

module.exports = { nextBestAction, priorityQueue, startNextBestAction, checkReplan, replan };
