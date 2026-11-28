const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// BIZ-PLN-03: goals & deadlines. Feeds deadline urgency / importance in adaptive.priority.js (importance 1-5, divide by 5 there).
const goalSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // DRAFT goals (B2 in the business doc) may not have a concept/title/deadline yet;
    // required-ness for an active goal is enforced in the service layer, not here.
    status: {
      type: String,
      enum: ['draft', 'active', 'paused', 'completed', 'expired', 'archived'],
      default: 'active',
    },
    wizardStep: { type: Number, default: null },
    pauseReason: { type: String, trim: true, maxlength: 500, default: null },
    examResultScore: { type: Number, min: 0, max: 10, default: null },
    closingNote: { type: String, trim: true, maxlength: 1000, default: null },
    activatedAt: { type: Date, default: null },
    pausedAt: { type: Date, default: null },
    closedAt: { type: Date, default: null },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept' },
    title: { type: String, trim: true, maxlength: 200 },
    deadline: { type: Date },
    importance: { type: Number, min: 1, max: 5, default: 3 },
    // Wizard v2 (Phase C, 4-step wizard): "điểm mong muốn" — a 0-10 exam score (Vietnamese grading
    // scale), not a mastery %. Student-set aspiration, never confused with the measured Mastery score.
    targetScore: { type: Number, min: 0, max: 10, default: null },
    // BIZ-PLN "Mục tiêu ôn thi" / "Quỹ thời gian": optional exam target + time-budget metadata.
    // Independent of `deadline` for now; a future wizard step will reconcile the two.
    examName: { type: String, trim: true, maxlength: 150, default: null },
    // "Ngày bắt đầu ôn" (Phase C step 2). Optional: goals created before this field existed, or via
    // other flows, may only have `deadline` + `studyDays`. When present, `studyDays` below is always
    // RE-DERIVED from startDate/deadline/restDays (see deriveStudyDays) rather than trusted as-sent.
    startDate: { type: Date, default: null },
    studyDays: { type: Number, min: 1, max: 180, default: null },
    minutesPerDay: { type: Number, min: 10, max: 480, default: null },
    restDays: { type: [Number], default: [] },
    // Step 1 "Tùy chọn nâng cao" — informational only, not read by any engine/scoring logic yet.
    examScope: { type: String, trim: true, maxlength: 2000, default: null },
    examFormat: { type: String, trim: true, maxlength: 100, default: null },
    selfReportedScore: { type: Number, min: 0, max: 10, default: null },
    // Personal "tài liệu ôn thi" attached to this goal — ownership checked in planning.service.
    documentIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'StudentDocumentItem' }], default: [] },
    // Step 3 "Kho chung" — shared/admin AssetItem docs selected alongside the student's own
    // documentIds above. Kept as a separate field (smaller diff than a discriminated documentIds).
    assetIds: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'AssetItem' }], default: [] },
  },
  { timestamps: true },
);

// Derived helper, not stored, to avoid drift with studyDays/minutesPerDay.
function computeTimeBudgetSummary(goal) {
  if (!goal || !goal.studyDays || !goal.minutesPerDay) return null;
  return { totalHours: (goal.studyDays * goal.minutesPerDay) / 60 };
}

function dateOnly(d) {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

// Calendar days from startDate to deadline (inclusive), minus the days that fall on a rest weekday.
// Used so `studyDays` stays a derived value once explicit dates are known, instead of a raw count
// the student types in — see planning.service's applyDerivedStudyDays.
function deriveStudyDays(startDate, deadline, restDays = []) {
  if (!startDate || !deadline) return null;
  const start = dateOnly(startDate);
  const end = dateOnly(deadline);
  const totalDays = Math.round((end - start) / 86400000) + 1;
  if (totalDays <= 0) return null;
  if (!restDays || restDays.length === 0) return totalDays;
  let restCount = 0;
  for (let i = 0; i < totalDays; i += 1) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    if (restDays.includes(d.getUTCDay())) restCount += 1;
  }
  return Math.max(totalDays - restCount, 1);
}

goalSchema.plugin(softDeletePlugin);
goalSchema.plugin(auditPlugin);
goalSchema.index({ owner: 1, deadline: 1 });

module.exports = mongoose.model('PlanningGoal', goalSchema);
module.exports.computeTimeBudgetSummary = computeTimeBudgetSummary;
module.exports.deriveStudyDays = deriveStudyDays;
module.exports.dateOnly = dateOnly;
