const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const masteryService = require('../mastery/mastery.service');
const planningService = require('../planning/planning.service');
const PlanningItem = require('../planning/planning.model');
const PlanningGoal = require('../planning/planning.goal.model');
const Concept = require('../knowledge/knowledge.model');
const knowledgeService = require('../knowledge/knowledge.service');
const notificationService = require('../notification/notification.service');
const AdaptiveActivity = require('./adaptive.model');
const { rankActivities, computePriority, buildActivity, explain } = require('./adaptive.priority');

const FIRST_PAGE = { limit: '100' }; // shortcut: only the first 100 mastery records / goals are considered
const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

function dayRange(date) {
  const vn = new Date(new Date(date).getTime() + VN_OFFSET_MS);
  const startUtcMs = Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate()) - VN_OFFSET_MS;
  return { start: new Date(startUtcMs), end: new Date(startUtcMs + 86400000) };
}

function copySessionFields(s, overrides = {}) {
  const plain = s.toObject ? s.toObject() : s;
  return {
    concept: plain.concept,
    startAt: plain.startAt,
    durationMin: plain.durationMin,
    status: plain.status,
    title: plain.title,
    chapterTitle: plain.chapterTitle,
    objectives: plain.objectives,
    note: plain.note,
    theoryContent: plain.theoryContent,
    questions: plain.questions,
    quizPassed: plain.quizPassed,
    lessonId: plain.lessonId,
    bookmarked: plain.bookmarked,
    ...overrides,
  };
}

function buildVnDayStartMs(baseDate, addDays = 0) {
  const vn = new Date(new Date(baseDate).getTime() + VN_OFFSET_MS);
  return Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), vn.getUTCDate() + addDays) - VN_OFFSET_MS;
}

function vnDayOfWeek(dayStartMs) {
  return new Date(dayStartMs + VN_OFFSET_MS).getUTCDay();
}

function withVnTimeOfDay(dayStartMs, refDate, offsetMinutes = 0) {
  const vnRef = new Date(new Date(refDate).getTime() + VN_OFFSET_MS);
  const baseMin = vnRef.getUTCHours() * 60 + vnRef.getUTCMinutes() + offsetMinutes;
  const clampedMin = Math.min(Math.max(baseMin, 0), 23 * 60 + 30);
  return new Date(dayStartMs + clampedMin * 60000);
}

// Schedule unfinished sessions starting tomorrow in UTC+7, respecting goal.restDays,
// goal.minutesPerDay, and never exceeding goal.deadline when set.
function scheduleSessionsWithGoal(sortedPending, goal, now) {
  const tomorrowStartMs = buildVnDayStartMs(now, 1);
  const restSet = new Set(goal?.restDays ?? []);
  const dailyCap = goal?.minutesPerDay || 120;
  const deadlineStartMs = goal?.deadline ? dayRange(goal.deadline).start.getTime() : null;

  const validDays = [];
  if (deadlineStartMs != null) {
    const span = Math.max(0, Math.round((deadlineStartMs - tomorrowStartMs) / 86400000));
    for (let d = 0; d <= span; d += 1) {
      const dayMs = tomorrowStartMs + d * 86400000;
      if (!restSet.has(vnDayOfWeek(dayMs))) validDays.push(dayMs);
    }
    if (validDays.length === 0) validDays.push(Math.max(tomorrowStartMs, deadlineStartMs));
  }

  const dayMinutes = new Map();
  let dayIdx = 0;
  let cursorMs = tomorrowStartMs;

  const nextOpenDayMs = () => {
    if (validDays.length > 0) {
      while (dayIdx < validDays.length) {
        const ms = validDays[dayIdx];
        if ((dayMinutes.get(ms) ?? 0) === 0 || (dayMinutes.get(ms) ?? 0) < dailyCap) return ms;
        dayIdx += 1;
      }
      // If all days before deadline hit dailyCap, distribute remaining sessions round-robin inside validDays.
      const fallbackMs = validDays[dayIdx % validDays.length];
      dayIdx += 1;
      return fallbackMs;
    }
    while (restSet.has(vnDayOfWeek(cursorMs))) {
      cursorMs += 86400000;
    }
    return cursorMs;
  };

  return sortedPending.map(({ s }) => {
    let dayMs = nextOpenDayMs();
    const used = dayMinutes.get(dayMs) ?? 0;
    if (validDays.length === 0 && used > 0 && used + s.durationMin > dailyCap) {
      cursorMs = dayMs + 86400000;
      dayMs = nextOpenDayMs();
    }
    const dayUsedBefore = dayMinutes.get(dayMs) ?? 0;
    dayMinutes.set(dayMs, dayUsedBefore + s.durationMin);
    const startAt = withVnTimeOfDay(dayMs, s.startAt, dayUsedBefore > 0 ? dayUsedBefore : 0);
    return copySessionFields(s, { startAt, status: 'planned' });
  });
}

async function loadActivities(ownerId, now) {
  const { start: todayStart } = dayRange(now);
  const [{ items: masteries }, { items: goals }] = await Promise.all([
    masteryService.listForOwner(ownerId, FIRST_PAGE),
    planningService.listGoals(ownerId, { ...FIRST_PAGE, status: 'active' }),
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

  // B3 + B9: only active, non-expired goals affect priority; if a goal targets a root/parent
  // concept with leaf descendants, attach the goal to its leaf concepts so NBA never surfaces
  // an entire subject root instead of an actionable leaf concept.
  const activeGoals = goals.filter(
    (g) =>
      (!g.status || g.status === 'active') &&
      g.concept &&
      (!g.deadline || new Date(g.deadline) >= todayStart),
  );
  for (const g of activeGoals) {
    const goalConceptId = String(g.concept._id ?? g.concept);
    const leafIds = mongoose.isValidObjectId(goalConceptId)
      ? await knowledgeService.getDescendantLeafIds(goalConceptId).catch(() => [])
      : [];
    if (leafIds.length > 0) {
      const leafSet = new Set(leafIds.map(String));
      let attached = false;
      for (const [cid, entry] of byConcept.entries()) {
        if (leafSet.has(cid)) {
          if (!entry.goal) entry.goal = g;
          attached = true;
        }
      }
      if (!attached) {
        const firstLeaf = await Concept.findById(leafIds[0]).select('_id name').lean();
        if (firstLeaf) {
          const entry = slot(firstLeaf);
          if (!entry.goal) entry.goal = g;
        }
      }
    } else {
      const entry = slot(g.concept);
      if (!entry.goal) entry.goal = g;
    }
  }

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

// UC-ADP-02: the student starts the current recommendation; deduplicated per day+concept (B8).
async function startNextBestAction(ownerId, now = new Date()) {
  const action = await nextBestAction(ownerId, now);
  if (!action) throw ApiError.conflict('No current recommendation to start');
  if (mongoose.isValidObjectId(ownerId) && mongoose.isValidObjectId(action.concept.id)) {
    const { start, end } = dayRange(now);
    const existing = await AdaptiveActivity.findOne({
      owner: ownerId,
      concept: action.concept.id,
      createdAt: { $gte: start, $lt: end },
    });
    if (existing) return { activity: existing, concept: action.concept };
  }

  const activity = await AdaptiveActivity.create({
    owner: ownerId,
    createdBy: ownerId,
    concept: action.concept.id,
    priority: action.priority,
    reason: action.reason,
  });
  return { activity, concept: action.concept };
}

async function getActivePlan(ownerId, planId, now = new Date()) {
  const plan = await planningService.getOwned(planId, { id: ownerId });
  if (plan.status !== 'active') throw ApiError.conflict('Plan is not active');
  if (typeof planningService.syncMissedSessions === 'function') {
    await planningService.syncMissedSessions(plan, now);
  }
  return plan;
}

const unfinished = (plan) => plan.sessions.filter((s) => s.status !== 'done' && s.status !== 'cancelled');
const missedSessions = (plan, now) =>
  unfinished(plan).filter((s) => s.status === 'missed' || s.startAt < now);

// AP-ADP-02: does this plan need replanning?
async function checkReplan(ownerId, planId, now = new Date()) {
  const plan = await getActivePlan(ownerId, planId, now);
  const missed = missedSessions(plan, now);
  return { needed: missed.length > 0, missedCount: missed.length };
}

// AP-ADP-03: re-rank the unfinished sessions of a plan by BR-40 priority (BR-13) and propose a new plan.
// Preserves full session metadata (B1) and done sessions (B10), prevents duplicate proposals (B2),
// and schedules in UTC+7 respecting goal.minutesPerDay, restDays and deadline (B4, B5).
async function replan(ownerId, planId, now = new Date()) {
  const plan = await getActivePlan(ownerId, planId, now);
  const missed = missedSessions(plan, now);
  if (!missed.length) throw ApiError.conflict('No missed sessions to replan');

  // B2: supersede any previous unconfirmed proposal for the same plan.
  if (mongoose.isValidObjectId(ownerId) && mongoose.isValidObjectId(plan._id)) {
    await PlanningItem.updateMany(
      { owner: ownerId, status: 'proposed', replaces: plan._id },
      { status: 'superseded' },
    );
  }

  const pending = unfinished(plan);
  const doneSessions = plan.sessions
    .filter((s) => s.status === 'done')
    .map((s) => copySessionFields(s, { status: 'done' }));

  const byId = new Map((await loadActivities(ownerId, now)).map((a) => [a.id, a]));
  const priorityOf = (s) =>
    computePriority(byId.get(String(s.concept)) || buildActivity({ id: String(s.concept) }, now));

  const sortedPending = pending.map((s) => ({ s, p: priorityOf(s) })).sort((x, y) => y.p - x.p);
  const goal =
    plan.goal && mongoose.isValidObjectId(plan.goal)
      ? await PlanningGoal.findById(plan.goal).lean()
      : null;
  const rescheduled = scheduleSessionsWithGoal(sortedPending, goal, now);

  const reason = `${missed.length} phiên bị bỏ lỡ; ${rescheduled.length} phiên chưa học được xếp lại theo mức ưu tiên, bắt đầu từ ngày mai`;
  const proposed = await planningService.create(ownerId, {
    title: `${plan.title} (điều chỉnh)`,
    status: 'proposed',
    replaces: plan._id,
    reason,
    goal: plan.goal ?? null,
    sessions: [...doneSessions, ...rescheduled],
  });

  try {
    await notificationService.create(ownerId, {
      title: 'Kế hoạch học tập được đề xuất lại',
      content: reason,
      category: 'hoc_tap',
      link: '/student/planner',
    });
  } catch {
    // shortcut: notifying is secondary to the replan succeeding.
  }

  return { plan: proposed, reason };
}

module.exports = { nextBestAction, priorityQueue, startNextBestAction, checkReplan, replan };
