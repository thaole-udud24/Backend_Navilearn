const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const PlanningItem = require('./planning.model');
const PlanningGoal = require('./planning.goal.model');
const QuestionItem = require('../question-bank/question-bank.model');
const StudentDocumentItem = require('../student-document/student-document.model');
const AssetItem = require('../asset/asset.model');
const knowledgeService = require('../knowledge/knowledge.service');
const accountMeService = require('../account/account.me.service');
const { resolveSubjectConceptIds } = require('../../shared/subjectFilter');

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

// `goalId` (raw, from an untrusted request body — e.g. the manual "Tự thiết kế" create) is verified
// owned before being trusted; callers that already resolved+verified the goal themselves (template
// apply, AI generation, adaptive replan — see those services) pass the ready-to-use `goal` field
// directly instead, skipping the redundant re-check.
async function create(ownerId, { goalId, goal, ...data }) {
  let goalRef = goal ?? null;
  if (goalId) {
    await getOwnedGoal(goalId, { id: ownerId });
    goalRef = goalId;
  }
  const item = await PlanningItem.create({ owner: ownerId, createdBy: ownerId, goal: goalRef, ...data });
  return withStageStatus(item);
}

// Real curriculum-coverage %: distinct real leaf Concepts the plan's sessions carry, over the total
// leaf Concept count of the goal's subject subtree (business doc §2/§4.9.1 "Phạm vi & giả định" —
// `uncovered_knowledge_ids[]`). Only a session whose `concept` IS a genuine leaf of that subtree
// counts — a session still carrying the goal's root subject concept (ad-hoc template step with no
// lesson, or an AI session the generator couldn't validly tag) does NOT count as covering anything,
// so this can legitimately read 0% rather than being inflated. Returns null (not 0%) when it can't
// be computed at all: no goal link (legacy plan), goal has no concept, or the subject has no
// recorded knowledge tree yet — never faking a number without real data behind it.
async function computeCoverage(plan) {
  if (!plan.goal) return null;
  const goal = await PlanningGoal.findById(plan.goal).select('concept').lean();
  if (!goal?.concept) return null;
  const leafIds = await knowledgeService.getDescendantLeafIds(goal.concept);
  if (!leafIds.length) return null;
  const leafSet = new Set(leafIds.map(String));
  const coveredLeafIds = new Set(
    (plan.sessions ?? []).map((s) => String(s.concept)).filter((c) => leafSet.has(c)),
  );
  return {
    coveredLeafCount: coveredLeafIds.size,
    totalLeafCount: leafIds.length,
    percent: Math.round((coveredLeafIds.size / leafIds.length) * 100),
  };
}

async function withCoverage(plain) {
  plain.coverage = await computeCoverage(plain);
  return plain;
}

async function listForOwner(ownerId, query, requester) {
  const { page, limit, skip } = parsePagination(query);
  const subjectIds = await resolveSubjectConceptIds(query.subjectId, requester);
  const filter = {
    owner: ownerId,
    ...(query.status ? { status: query.status } : {}),
  };
  if (query.concept && subjectIds) {
    filter['sessions.concept'] = subjectIds.some((id) => String(id) === String(query.concept))
      ? query.concept
      : null;
  } else if (query.concept) {
    filter['sessions.concept'] = query.concept;
  } else if (subjectIds) {
    const goalIds = (
      await PlanningGoal.find({ owner: ownerId, concept: { $in: subjectIds } }).select('_id').lean()
    ).map((g) => g._id);
    filter.$or = [{ 'sessions.concept': { $in: subjectIds } }, { goal: { $in: goalIds } }];
  }
  const [items, total] = await Promise.all([
    PlanningItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    PlanningItem.countDocuments(filter),
  ]);
  return {
    items: await Promise.all(items.map(withStageStatus).map(withCoverage)),
    meta: buildMeta(page, limit, total),
  };
}

// Personal learning data (BR-02/BR-35): owner only, admin gets no access.
async function getOwned(id, requester) {
  const item = await PlanningItem.findById(id);
  if (!item) throw ApiError.notFound('Plan not found');
  if (String(item.owner) !== String(requester.id)) throw ApiError.forbidden('Not the owner of this plan');
  return item;
}

async function getOwnedForResponse(id, requester) {
  return withCoverage(withStageStatus(await getOwned(id, requester)));
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

// A planned session whose start has passed counts as missed (same rule as ADP's missedSessions).
const effectiveStatus = (s, now) => (s.status === 'planned' && s.startAt < now ? 'missed' : s.status);

// UC-PLN-01/02: sessions of the student's active plans, flat and sorted, for calendar and history views.
// shortcut: not paginated and not filterable by subject; a calendar needs the whole window.
async function listSessions(ownerId, { from, to, status, subjectId }, now = new Date(), requester) {
  const subjectIds = await resolveSubjectConceptIds(subjectId, requester);
  const allowedSet = subjectIds ? new Set(subjectIds.map(String)) : null;
  const plans = await PlanningItem.find({ owner: ownerId, status: 'active' });
  return plans
    .flatMap((p) =>
      p.sessions
        .filter((s) => !allowedSet || (s.concept && allowedSet.has(String(s.concept))))
        .map((s) => ({
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

// Calendar-day bounds in UTC — same convention adaptive.service.replan uses for "which day" math.
function dayRange(date) {
  const start = new Date(date);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

// v2.1 §4.9.2: Phân rã mỗi buổi học thành các loại nhiệm vụ chuẩn theo tỷ lệ thời gian.
function buildTaskBreakdown(s) {
  const dur = Math.max(5, s.durationMin || 30);
  const hasTheory = Boolean(s.theoryContent && s.theoryContent.trim());
  const hasQuiz = (s.questions?.length ?? 0) > 0;

  if (hasTheory && hasQuiz) {
    const theoryMin = Math.max(5, Math.round(dur * 0.45));
    const exerciseMin = Math.max(5, Math.round(dur * 0.4));
    const checkMin = Math.max(1, dur - theoryMin - exerciseMin);
    return {
      taskType: 'MIXED',
      breakdown: [
        { type: 'THEORY', label: 'Học lý thuyết trọng tâm', minutes: theoryMin },
        { type: 'EXERCISE', label: 'Luyện bài tập vận dụng', minutes: exerciseMin },
        { type: 'QUICK_CHECK', label: 'Kiểm tra nhanh', minutes: checkMin },
      ],
    };
  }
  if (hasTheory) {
    return {
      taskType: 'THEORY',
      breakdown: [{ type: 'THEORY', label: 'Học lý thuyết trọng tâm', minutes: dur }],
    };
  }
  if (hasQuiz) {
    return {
      taskType: 'EXERCISE',
      breakdown: [{ type: 'EXERCISE', label: 'Luyện bài tập vận dụng', minutes: dur }],
    };
  }
  return {
    taskType: 'REVIEW_PREV',
    breakdown: [{ type: 'REVIEW_PREV', label: 'Ôn lại kiến thức', minutes: dur }],
  };
}

function toTask(plan, s) {
  const { taskType, breakdown } = buildTaskBreakdown(s);
  return {
    planId: plan._id,
    sessionId: s._id,
    concept: s.concept,
    title: s.title,
    chapterTitle: s.chapterTitle,
    durationMin: s.durationMin,
    status: s.status,
    quizPassed: s.quizPassed,
    startAt: s.startAt,
    questions: s.questions,
    hasQuiz: (s.questions?.length ?? 0) > 0,
    taskType,
    breakdown,
  };
}

// "Kế hoạch ngày" (B8 "Hôm nay"): derived grouping of the student's active-plan sessions whose
// startAt falls on one calendar day — no schema change, just a read-side view over sessions[].
async function getDailyPlan(ownerId, { date, subjectId } = {}, requester) {
  const { start, end } = dayRange(date ? new Date(date) : new Date());
  const subjectIds = await resolveSubjectConceptIds(subjectId, requester);
  const allowedSet = subjectIds ? new Set(subjectIds.map(String)) : null;
  const plans = await PlanningItem.find({ owner: ownerId, status: 'active' });
  const tasks = plans
    .flatMap((p) =>
      p.sessions
        .filter(
          (s) =>
            s.startAt >= start &&
            s.startAt < end &&
            (!allowedSet || (s.concept && allowedSet.has(String(s.concept)))),
        )
        .map((s) => toTask(p, s)),
    )
    .sort((a, b) => a.startAt - b.startAt);
  const totalMinutes = tasks.reduce((sum, t) => sum + (t.durationMin || 0), 0);
  const completedMinutes = tasks
    .filter((t) => t.status === 'done')
    .reduce((sum, t) => sum + (t.durationMin || 0), 0);
  return { date: start, totalMinutes, completedMinutes, tasks };
}

// Lightweight extension of getDailyPlan for a calendar/week view: same filter, grouped per day.
async function getDailyPlanRange(ownerId, { from, to, subjectId }, requester) {
  const { start } = dayRange(new Date(from));
  const { end } = dayRange(new Date(to));
  const subjectIds = await resolveSubjectConceptIds(subjectId, requester);
  const allowedSet = subjectIds ? new Set(subjectIds.map(String)) : null;
  const plans = await PlanningItem.find({ owner: ownerId, status: 'active' });
  const byDate = new Map();
  for (const p of plans) {
    for (const s of p.sessions) {
      if (s.startAt < start || s.startAt >= end) continue;
      if (allowedSet && (!s.concept || !allowedSet.has(String(s.concept)))) continue;
      const key = dayRange(s.startAt).start.toISOString();
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(toTask(p, s));
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, tasks]) => ({ date: new Date(date), tasks: tasks.sort((a, b) => a.startAt - b.startAt) }));
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
  const { status, note, ...rest } = data;
  const { bookmarked, ...timing } = rest;
  const reschedules = Object.keys(timing).length > 0;
  if (bookmarked !== undefined) session.bookmarked = bookmarked;
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
  if (status === 'done') {
    await accountMeService.recordStudyActivity(requester.id).catch(() => {});
  }
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
  if (passed) {
    await accountMeService.recordStudyActivity(requester.id).catch(() => {});
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

// A goal may only attach the owner's own documents — never another student's.
async function assertOwnedDocuments(ownerId, documentIds) {
  if (!documentIds || documentIds.length === 0) return;
  const count = await StudentDocumentItem.countDocuments({
    _id: { $in: documentIds },
    owner: ownerId,
    status: 'active',
  });
  if (count !== documentIds.length) {
    throw ApiError.badRequest('Một hoặc nhiều tài liệu không hợp lệ', 'INVALID_DOCUMENT_IDS');
  }
}

// Step 3 "Kho chung": shared AssetItem docs are admin-owned, not owner-scoped — just confirm each
// one is a real, still-active asset.
async function assertActiveAssets(assetIds) {
  if (!assetIds || assetIds.length === 0) return;
  const count = await AssetItem.countDocuments({ _id: { $in: assetIds }, status: 'active' });
  if (count !== assetIds.length) {
    throw ApiError.badRequest('Một hoặc nhiều tài liệu dùng chung không hợp lệ', 'INVALID_ASSET_IDS');
  }
}

// Phase C step 2: once startDate+deadline are known, studyDays is always RE-DERIVED from them
// (ignoring any raw studyDays sent by the client) so it can never drift from the actual date range.
// Goals with no startDate (legacy, or other callers) keep behaving as before — studyDays as-sent.
function applyDerivedStudyDays(target) {
  if (target.startDate && target.deadline) {
    const derived = PlanningGoal.deriveStudyDays(target.startDate, target.deadline, target.restDays ?? []);
    if (derived != null) target.studyDays = derived;
  }
  return target;
}

// A goal's date range, used only for the overlap check below. Goals created before `startDate`
// existed derive a reasonable start from `deadline - studyDays` (calendar days).
function goalDateRange(goal) {
  if (!goal || !goal.deadline) return null;
  const end = PlanningGoal.dateOnly(goal.deadline);
  if (goal.startDate) return { start: PlanningGoal.dateOnly(goal.startDate), end };
  if (goal.studyDays) {
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - (goal.studyDays - 1));
    return { start, end };
  }
  return null;
}

function overlapDaysOf(rangeA, rangeB) {
  const start = rangeA.start > rangeB.start ? rangeA.start : rangeB.start;
  const end = rangeA.end < rangeB.end ? rangeA.end : rangeB.end;
  return Math.max(Math.round((end - start) / 86400000) + 1, 0);
}

// Phase C step 2 "overlap warning": does this (draft) goal's proposed date range + minutesPerDay
// clash with any of the student's OTHER active goals? Returns null when there's nothing to warn
// about, otherwise { subjects, totalMinutesPerDay, overlapDays } for the draft-save response.
// shortcut: when more than one other goal overlaps, `overlapDays` is the widest single overlapping
// range, not the exact union of days across all of them — upgrade if goals routinely stack 3+ deep.
async function checkGoalOverlap(ownerId, candidate, excludeId) {
  const candidateRange = goalDateRange(candidate);
  if (!candidateRange || !candidate.minutesPerDay) return null;

  const others =
    (await PlanningGoal.find({
      owner: ownerId,
      status: 'active',
      ...(excludeId ? { _id: { $ne: excludeId } } : {}),
    }).populate('concept', 'name')) ?? [];

  const hits = [];
  for (const other of others) {
    const otherRange = goalDateRange(other);
    if (!otherRange || !other.minutesPerDay) continue;
    const overlapDays = overlapDaysOf(candidateRange, otherRange);
    if (overlapDays > 0) {
      const subject = other.concept && typeof other.concept === 'object' ? other.concept.name : other.title;
      hits.push({ subject, minutesPerDay: other.minutesPerDay, overlapDays });
    }
  }
  if (hits.length === 0) return null;

  return {
    subjects: hits.map((h) => h.subject),
    totalMinutesPerDay: candidate.minutesPerDay + hits.reduce((sum, h) => sum + h.minutesPerDay, 0),
    overlapDays: Math.max(...hits.map((h) => h.overlapDays)),
  };
}

async function createGoal(ownerId, data) {
  await assertOwnedDocuments(ownerId, data.documentIds);
  await assertActiveAssets(data.assetIds);
  return PlanningGoal.create({
    owner: ownerId,
    createdBy: ownerId,
    activatedAt: new Date(),
    ...applyDerivedStudyDays({ ...data }),
  });
}

async function listGoals(ownerId, query, requester) {
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
  await assertOwnedDocuments(requester.id, data.documentIds);
  await assertActiveAssets(data.assetIds);
  Object.assign(goal, data, { updatedBy: requester.id });
  applyDerivedStudyDays(goal);
  await goal.save();
  return goal;
}

async function removeGoal(id, requester) {
  const goal = await getOwnedGoal(id, requester);
  await goal.softDelete();
}

// B2: one open draft per owner at a time, matching the single-banner wireframe. Upserts in place
// across wizard steps instead of creating a new draft document each step.
// Phase C step 2: also returns `overlapWarning` (see checkGoalOverlap) when the draft's proposed
// dates/minutesPerDay clash with another active goal — simplest place to surface it, no extra endpoint.
async function saveDraftGoal(ownerId, data) {
  await assertOwnedDocuments(ownerId, data.documentIds);
  await assertActiveAssets(data.assetIds);
  const draft = await PlanningGoal.findOne({ owner: ownerId, status: 'draft' });
  let saved;
  if (draft) {
    Object.assign(draft, data, { updatedBy: ownerId });
    applyDerivedStudyDays(draft);
    await draft.save();
    saved = draft;
  } else {
    saved = await PlanningGoal.create({
      owner: ownerId,
      createdBy: ownerId,
      status: 'draft',
      ...applyDerivedStudyDays({ ...data }),
    });
  }
  const overlapWarning = await checkGoalOverlap(ownerId, saved, saved._id);
  const result = saved.toObject ? saved.toObject() : saved;
  return overlapWarning ? { ...result, overlapWarning } : result;
}

async function getOpenDraft(ownerId) {
  return PlanningGoal.findOne({ owner: ownerId, status: 'draft' }).populate('concept', 'name');
}

const ACTIVATE_REQUIRED_FIELDS = ['concept', 'title', 'deadline', 'examName', 'targetScore', 'studyDays', 'minutesPerDay'];

async function activateDraftGoal(ownerId, goalId, finalData) {
  const goal = await getOwnedGoal(goalId, { id: ownerId });
  if (goal.status !== 'draft') throw ApiError.badRequest('Mục tiêu này không ở trạng thái nháp', 'GOAL_NOT_DRAFT');
  await assertOwnedDocuments(ownerId, finalData.documentIds);
  await assertActiveAssets(finalData.assetIds);
  Object.assign(goal, finalData, { updatedBy: ownerId });
  applyDerivedStudyDays(goal);
  const missing = ACTIVATE_REQUIRED_FIELDS.filter((f) => goal[f] === undefined || goal[f] === null || goal[f] === '');
  if (missing.length > 0) {
    throw ApiError.badRequest(`Thiếu thông tin bắt buộc: ${missing.join(', ')}`, 'GOAL_INCOMPLETE');
  }
  goal.status = 'active';
  goal.activatedAt = new Date();
  goal.wizardStep = null;
  await goal.save();
  return goal;
}

// v2.1 §14.5.6: Tạm dừng · Tiếp tục · Đóng · Lưu trữ mục tiêu ôn thi
async function pauseGoal(id, requester, { reason } = {}) {
  const goal = await getOwnedGoal(id, requester);
  if (goal.status !== 'active') {
    throw ApiError.conflict('Chỉ có thể tạm dừng mục tiêu đang hoạt động', 'GOAL_NOT_ACTIVE');
  }
  goal.status = 'paused';
  goal.pausedAt = new Date();
  goal.pauseReason = reason ?? null;
  goal.updatedBy = requester.id;
  await goal.save();
  return goal;
}

async function resumeGoal(id, requester) {
  const goal = await getOwnedGoal(id, requester);
  if (goal.status !== 'paused') {
    throw ApiError.conflict('Chỉ có thể tiếp tục mục tiêu đang tạm dừng', 'GOAL_NOT_PAUSED');
  }
  goal.status = 'active';
  goal.updatedBy = requester.id;
  await goal.save();
  return goal;
}

async function closeGoal(id, requester, { examResultScore, closingNote } = {}) {
  const goal = await getOwnedGoal(id, requester);
  if (!['active', 'paused', 'expired'].includes(goal.status)) {
    throw ApiError.conflict('Mục tiêu không ở trạng thái có thể đóng', 'GOAL_CANNOT_CLOSE');
  }
  goal.status = 'completed';
  goal.closedAt = new Date();
  if (examResultScore !== undefined) goal.examResultScore = examResultScore;
  if (closingNote !== undefined) goal.closingNote = closingNote;
  goal.updatedBy = requester.id;
  await goal.save();
  return goal;
}

async function archiveGoal(id, requester) {
  const goal = await getOwnedGoal(id, requester);
  goal.status = 'archived';
  goal.closedAt = goal.closedAt ?? new Date();
  goal.updatedBy = requester.id;
  await goal.save();
  return goal;
}

module.exports = {
  create,
  computeCoverage,
  listForOwner,
  listSessions,
  getDailyPlan,
  getDailyPlanRange,
  getOwned,
  getOwnedForResponse,
  confirm,
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
  saveDraftGoal,
  getOpenDraft,
  activateDraftGoal,
  pauseGoal,
  resumeGoal,
  closeGoal,
  archiveGoal,
  checkGoalOverlap,
};
