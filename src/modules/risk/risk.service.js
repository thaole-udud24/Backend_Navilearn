const ApiError = require('../../utils/ApiError');
const planningService = require('../planning/planning.service');
const masteryService = require('../mastery/mastery.service');
const businessRuleService = require('../business-rule/business-rule.service');
const RiskWarningDismissal = require('./risk.model');

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
    if (!m.concept) continue;
    if (masteryService.computeDisplayState(m, decayDays) !== 'DECAY_RISK') continue;
    const key = `decay:${m.concept._id}`;
    if (isSuppressed(dismissals, key, now)) continue;
    const daysSince = m.lastAttemptAt
      ? Math.floor((now.getTime() - new Date(m.lastAttemptAt).getTime()) / DAY_MS)
      : null;
    warnings.push({
      key,
      type: 'decay',
      severity: 'thap',
      title: `Chuỗi học sắp đứt — ${m.concept.name}`,
      reason:
        daysSince === null
          ? `Chưa ôn lại kiến thức này (ngưỡng ${decayDays} ngày).`
          : `Đã ${daysSince} ngày chưa ôn lại kiến thức này (ngưỡng ${decayDays} ngày).`,
      actions: ['keep', 'snooze'],
    });
  }
  return warnings;
}

const SEVERITY_ORDER = { cao: 0, trung_binh: 1, thap: 2 };

// N9: hệ thống tự sinh cảnh báo (không phải sinh viên tự báo cáo) — BR-12/BR-13: mỗi cảnh báo kèm lý
// do và hành động đề xuất, dựa trên ngưỡng Admin cấu hình ở B14. Cảnh báo không được lưu lại — luôn
// tính lại "sống" từ goal/plan/mastery hiện tại, trừ những cảnh báo đã bị sinh viên dismiss/snooze.
async function listWarnings(ownerId, now = new Date()) {
  const thresholds = await businessRuleService.getRiskThresholds();
  const [{ items: plans }, { items: masteries }, dismissals] = await Promise.all([
    planningService.listForOwner(ownerId, { status: 'active', limit: '100' }),
    masteryService.listForOwner(ownerId, { limit: '100' }),
    loadDismissals(ownerId),
  ]);

  const warnings = [
    ...scheduleWarnings(plans, thresholds['risk.fallingBehindPercent'], dismissals, now),
    ...masteryWarnings(masteries, thresholds['risk.weakMasteryPercent'], dismissals, now),
    ...decayWarnings(masteries, thresholds['risk.decayDays'], dismissals, now),
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
