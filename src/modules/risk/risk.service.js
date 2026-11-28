const ApiError = require('../../utils/ApiError');
const planningService = require('../planning/planning.service');
const masteryService = require('../mastery/mastery.service');
const businessRuleService = require('../business-rule/business-rule.service');
const RiskWarningDismissal = require('./risk.model');
const Concept = require('../knowledge/knowledge.model');
const MasteryItem = require('../mastery/mastery.model');
const PlanningGoal = require('../planning/planning.goal.model');

const DAY_MS = 86400000;
// shortcut: fixed snooze length, no custom date picker — BR-13 only calls for "nhắc sau", not a
// scheduled reminder.
const SNOOZE_DAYS = 3;

async function loadDismissals(ownerId) {
  const rows = await RiskWarningDismissal.find({ owner: ownerId });
  return new Map(rows.map((r) => [r.key, r]));
}

// `until: null` ("giữ nguyên") suppresses indefinitely; a future `until` ("nhắc tôi sau") suppresses
// until that date, after which the warning can resurface if the underlying condition still holds.
function isSuppressed(dismissals, key, now) {
  const row = dismissals.get(key);
  if (!row) return false;
  return row.until === null || row.until > now;
}

// N9/BR-13: per active plan, per chặng (sessions grouped by chapterTitle), compare the schedule's
// expected progress (how many sessions SHOULD be done by now) against the actual progress (how many
// ARE done) — a gap over the Admin threshold (B14, BR-17-FALLING-BEHIND) means the chặng is at risk
// of running late.
function scheduleWarnings(plans, threshold, dismissals, now) {
  const warnings = [];
  for (const plan of plans) {
    const byChapter = new Map();
    for (const s of plan.sessions ?? []) {
      const chapter = s.chapterTitle?.trim();
      if (!chapter) continue; // no stage grouping on this session — nothing to evaluate it against
      if (!byChapter.has(chapter)) byChapter.set(chapter, []);
      byChapter.get(chapter).push(s);
    }
    for (const [chapter, sessions] of byChapter) {
      const total = sessions.length;
      const due = sessions.filter((s) => s.status !== 'cancelled' && new Date(s.startAt) <= now);
      if (due.length === 0) continue; // no session in this chặng was due yet — nothing to judge
      const done = sessions.filter((s) => s.status === 'done');
      const expectedPercent = Math.round((due.length / total) * 100);
      const actualPercent = Math.round((done.length / total) * 100);
      const gap = expectedPercent - actualPercent;
      if (gap < threshold) continue;
      const key = `schedule:${plan._id}:${chapter}`;
      if (isSuppressed(dismissals, key, now)) continue;
      const missedCount = due.filter((s) => s.status !== 'done').length;
      warnings.push({
        key,
        type: 'schedule',
        severity: gap >= threshold * 2 ? 'cao' : 'trung_binh',
        title: `${chapter} có nguy cơ trễ tiến độ`,
        reason: `Tiến độ ${actualPercent}% so với kế hoạch ${expectedPercent}%. Nguyên nhân: bỏ lỡ ${missedCount} buổi học.`,
        actions: ['replan', 'keep', 'snooze'],
        planId: String(plan._id),
      });
    }
  }
  return warnings;
}

// B14 "Mastery yếu dưới (%)" — reuses the Learning-State 'developing' cutoff (mastery.developing):
// a concept the student has actually attempted at least once but is still weak.
function masteryWarnings(masteries, weakThreshold, dismissals, now) {
  const warnings = [];
  for (const m of masteries) {
    if (!m.concept || m.attemptsCount < 1 || m.score >= weakThreshold) continue;
    const key = `mastery:${m.concept._id}`;
    if (isSuppressed(dismissals, key, now)) continue;
    warnings.push({
      key,
      type: 'mastery',
      severity: 'trung_binh',
      title: `Chủ đề ${m.concept.name} yếu (Mastery ${m.score}%)`,
      reason: `Mức thành thạo thấp hơn ngưỡng ${weakThreshold}% hệ thống cấu hình.`,
      actions: ['keep', 'snooze'],
    });
  }
  return warnings;
}

// B14 "Ngày không học liên tiếp" (BR-17-RETENTION-RISK): a concept whose Learning State has decayed
// into DECAY_RISK — reuses mastery.service's existing decay derivation, now fed the Admin-configured
// threshold instead of the hardcoded constant.
function decayWarnings(masteries, decayDays, dismissals, now) {
  const warnings = [];

  for (const m of masteries) {
    if (!m.concept || !m.lastAttemptAt) continue;

    const eligibleStates = ['PRACTICING', 'UNDERSTOOD', 'APPLIED', 'DECAY_RISK'];
    if (!eligibleStates.includes(m.learningState)) continue;

    const elapsed = now.getTime() - new Date(m.lastAttemptAt).getTime();
    if (!Number.isFinite(elapsed) || elapsed <= decayDays * DAY_MS) continue;

    const key = `decay:${m.concept._id}`;
    if (isSuppressed(dismissals, key, now)) continue;

    warnings.push({
      key,
      type: 'decay',
      severity: 'thap',
      title: `Cần ôn lại ${m.concept.name}`,
      reason: `Đã quá ${decayDays} ngày kể từ lần luyện tập gần nhất cho kiến thức này.`,
      actions: ['keep', 'snooze'],
    });
  }

  return warnings;
}

const SEVERITY_ORDER = { cao: 0, trung_binh: 1, thap: 2 };

// BE-RSK-03 / AP-RSK-02: phát hiện kiến thức tiên quyết còn yếu
// trước một buổi học sắp tới. Chỉ xét quan hệ tiên quyết trực tiếp.
async function prerequisiteWarnings(ownerId, plans, weakThreshold, dismissals, now) {
  const horizon = now.getTime() + 7 * DAY_MS;
  const upcoming = [];

  for (const plan of plans) {
    for (const session of plan.sessions ?? []) {
      if (session.status !== 'planned' || !session.concept) continue;

      const startAt = new Date(session.startAt).getTime();
      if (!Number.isFinite(startAt) || startAt > horizon) continue;

      upcoming.push({
        planId: String(plan._id),
        conceptId: String(session.concept),
      });
    }
  }

  if (upcoming.length === 0) return [];

  const targetIds = [...new Set(upcoming.map((item) => item.conceptId))];
  const targets = await Concept.find({
    _id: { $in: targetIds },
    status: 'active',
  })
    .select('name prerequisites')
    .lean();

  const targetById = new Map(targets.map((item) => [String(item._id), item]));
  const prerequisiteIds = [
    ...new Set(targets.flatMap((item) => (item.prerequisites ?? []).map(String))),
  ];
  if (prerequisiteIds.length === 0) return [];

  const [prerequisites, masteries] = await Promise.all([
    Concept.find({
      _id: { $in: prerequisiteIds },
      status: 'active',
    })
      .select('name')
      .lean(),
    MasteryItem.find({
      owner: ownerId,
      concept: { $in: prerequisiteIds },
    })
      .select('concept score attemptsCount')
      .lean(),
  ]);

  const prerequisiteById = new Map(
    prerequisites.map((item) => [String(item._id), item]),
  );
  const masteryByConcept = new Map(
    masteries.map((item) => [String(item.concept), item]),
  );

  const warnings = [];
  const seen = new Set();

  for (const { planId, conceptId } of upcoming) {
    const key = `prerequisite:${planId}:${conceptId}`;
    if (seen.has(key) || isSuppressed(dismissals, key, now)) continue;
    seen.add(key);

    const target = targetById.get(conceptId);
    if (!target) continue;

    const weak = (target.prerequisites ?? [])
      .map((id) => prerequisiteById.get(String(id)))
      .filter(Boolean)
      .filter((prerequisite) => {
        const mastery = masteryByConcept.get(String(prerequisite._id));
        return !mastery ||
          mastery.attemptsCount < 1 ||
          mastery.score < weakThreshold;
      });

    if (weak.length === 0) continue;

    warnings.push({
      key,
      // Dùng type hiện có để frontend đang chạy hiển thị được cảnh báo.
      type: 'mastery',
      severity: weak.length >= 2 ? 'cao' : 'trung_binh',
      title: `Thiếu kiến thức nền cho ${target.name}`,
      reason: `Cần củng cố ${weak.map((item) => item.name).join(', ')} trước khi học ${target.name}. Các kiến thức này chưa được đánh giá hoặc có Mastery dưới ${weakThreshold}%.`,
      actions: ['replan', 'keep', 'snooze'],
      planId,
    });
  }

  return warnings;
}

// BE-RSK-04 / AP-RSK-03: phát hiện hai mục tiêu có hạn gần nhau
// khi cả hai vẫn còn buổi học cần hoàn thành.
async function deadlineCollisionWarnings(ownerId, plans, dismissals, now) {
  const NEARBY_DAYS = 2;
  const LOOKAHEAD_DAYS = 7;

  const plansByGoal = new Map();

  for (const plan of plans) {
    if (!plan.goal) continue;

    const pendingCount = (plan.sessions ?? []).filter(
      (session) => session.status === 'planned' || session.status === 'missed',
    ).length;
    if (pendingCount === 0) continue;

    const goalId = String(plan.goal);
    const existing = plansByGoal.get(goalId);

    // Nếu một mục tiêu có nhiều kế hoạch, giữ kế hoạch có nhiều việc chưa xong nhất.
    if (!existing || pendingCount > existing.pendingCount) {
      plansByGoal.set(goalId, {
        planId: String(plan._id),
        pendingCount,
      });
    }
  }

  if (plansByGoal.size < 2) return [];

  const startOfToday = new Date(now);
  startOfToday.setUTCHours(0, 0, 0, 0);

  const endOfWindow = new Date(now.getTime() + LOOKAHEAD_DAYS * DAY_MS);

  const goals = await PlanningGoal.find({
    _id: { $in: [...plansByGoal.keys()] },
    owner: ownerId,
    status: 'active',
    deadline: { $gte: startOfToday, $lte: endOfWindow },
  })
    .select('_id title deadline')
    .sort({ deadline: 1 })
    .lean();

  const dayNumber = (date) => {
    const value = new Date(date);
    return Date.UTC(
      value.getUTCFullYear(),
      value.getUTCMonth(),
      value.getUTCDate(),
    ) / DAY_MS;
  };

  const formatDate = (date) =>
    new Date(date).toLocaleDateString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
    });

  const warnings = [];

  for (let i = 0; i < goals.length; i += 1) {
    for (let j = i + 1; j < goals.length; j += 1) {
      const first = goals[i];
      const second = goals[j];
      const daysApart = dayNumber(second.deadline) - dayNumber(first.deadline);

      if (daysApart > NEARBY_DAYS) break;

      const firstPlan = plansByGoal.get(String(first._id));
      const secondPlan = plansByGoal.get(String(second._id));
      const key = `deadline:${first._id}:${second._id}`;

      if (isSuppressed(dismissals, key, now)) continue;

      warnings.push({
        key,
        // Frontend hiện đã hỗ trợ type "schedule".
        type: 'schedule',
        severity: daysApart === 0 ? 'cao' : 'trung_binh',
        title: 'Các mục tiêu có hạn học tập gần nhau',
        reason:
          `"${first.title}" hạn ${formatDate(first.deadline)} ` +
          `còn ${firstPlan.pendingCount} buổi chưa xong; ` +
          `"${second.title}" hạn ${formatDate(second.deadline)} ` +
          `còn ${secondPlan.pendingCount} buổi chưa xong.`,
        actions: ['replan', 'keep', 'snooze'],
        planId: firstPlan.planId,
      });
    }
  }

  return warnings;
}

async function listAllMasteries(ownerId) {
  const all = [];
  const limit = 100;
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { items } = await masteryService.listForOwner(ownerId, {
      page,
      limit,
    });

    all.push(...items);
    hasMore = items.length === limit;
    page += 1;
  }

  return all;
}

// N9: hệ thống tự sinh cảnh báo (không phải sinh viên tự báo cáo) — BR-12/BR-13: mỗi cảnh báo kèm lý
// do và hành động đề xuất, dựa trên ngưỡng Admin cấu hình ở B14. Cảnh báo không được lưu lại — luôn
// tính lại "sống" từ goal/plan/mastery hiện tại, trừ những cảnh báo đã bị sinh viên dismiss/snooze.
async function listWarnings(ownerId, now = new Date()) {
  const thresholds = await businessRuleService.getRiskThresholds();
  const [{ items: plans }, masteries, dismissals] = await Promise.all([
  planningService.listForOwner(ownerId, { status: 'active', limit: '100' }),
  listAllMasteries(ownerId),
  loadDismissals(ownerId),
  ]);

  const warnings = [
    ...scheduleWarnings(plans, thresholds['risk.fallingBehindPercent'], dismissals, now),
    ...masteryWarnings(masteries, thresholds['risk.weakMasteryPercent'], dismissals, now),
    ...decayWarnings(masteries, thresholds['risk.decayDays'], dismissals, now),
    ...await prerequisiteWarnings(ownerId, plans, thresholds['risk.weakMasteryPercent'], dismissals, now),
    ...await deadlineCollisionWarnings(ownerId, plans, dismissals, now),
  ];
  return warnings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

// "Giữ nguyên" (keep — suppressed indefinitely, an explicit ack) or "Nhắc tôi sau" (snooze
// SNOOZE_DAYS days). The real "điều chỉnh lộ trình" action is not handled here — it calls the
// existing adaptive.service.replan directly (same trigger Planner.tsx already uses).
async function dismiss(ownerId, key, action, now = new Date()) {
  if (!key || !key.trim()) throw ApiError.badRequest('Thiếu khoá cảnh báo', 'INVALID_WARNING_KEY');
  const until = action === 'snooze' ? new Date(now.getTime() + SNOOZE_DAYS * DAY_MS) : null;
  return RiskWarningDismissal.findOneAndUpdate(
    { owner: ownerId, key },
    { owner: ownerId, key, action, until },
    { upsert: true, new: true },
  );
}

module.exports = { listWarnings, dismiss, SNOOZE_DAYS };
