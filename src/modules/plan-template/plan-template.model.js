const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// One step of a template plan: relative to the day the student applies the template, not an
// absolute date, since the same template is reused by many students at different times.
const stepSchema = new mongoose.Schema(
  {
    dayOffset: { type: Number, required: true, min: 1, max: 60 },
    durationMin: { type: Number, required: true, min: 5, max: 480 },
    // Stage name shown throughout (Admin builder, student roadmap) — separate from `note`, which
    // is only a short optional description, so one field doesn't have to serve both purposes.
    title: { type: String, required: true, trim: true, maxlength: 150 },
    // Groups steps under a chapter header in the student roadmap UI — purely a display grouping,
    // never used for unlock/prerequisite logic (that still comes from `questions`/stage order).
    chapterTitle: { type: String, trim: true, maxlength: 150, default: '' },
    note: { type: String, trim: true, maxlength: 300 },
    // "Sau buổi này bạn có thể…" — shown to the student once this step is applied into their plan.
    objectives: { type: [String], default: [], validate: (v) => v.length <= 6 },
    // UC-PLN-TPL-03: a step is a real mini-lesson, not just a label — theory to read, then
    // questions to check understanding before the student can mark it done.
    theoryContent: { type: String, trim: true, maxlength: 8000, default: '' },
    questions: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'QuestionItem' }], default: [] },
    // Optional link to a Thư viện bài học lesson this step was authored from (traceability + "sync
    // lại" capability) — purely a reference, not the live source of truth: objectives/theoryContent/
    // questions above are always a snapshot copied from the lesson at save/sync time (same
    // reference-vs-snapshot tradeoff as question-bank questions embedded by id elsewhere), so a step
    // keeps working unchanged (e.g. in plan-template.apply()) even if the lesson later changes.
    lessonId: { type: mongoose.Schema.Types.ObjectId, ref: 'LessonItem', default: null },
  },
  { _id: false },
);

// Admin-designed roadmap a student can pick instead of building a plan by hand or asking the AI
// (UC-PLN-TPL-01). `concept` is the default for every step; a step may need a concept of its own
// only once templates span multiple topics, which is out of scope for now (BRD §1.5).
const planTemplateSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', default: null },
    steps: { type: [stepSchema], required: true, validate: (v) => v.length > 0 && v.length <= 20 },
    // Draft/publish gate (simplified versioning — see plan-template.service.publish): a draft is
    // never offered to students; publishing bumps `version` and records `changeLog`/`publishedAt`.
    // There is no immutable per-version history — editing a published template changes it in place.
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    version: { type: Number, default: 1 },
    publishedAt: { type: Date, default: null },
    changeLog: { type: String, trim: true, maxlength: 500, default: '' },
    source: { type: String, enum: ['manual', 'ai', 'import'], default: 'manual' },
  },
  { timestamps: true },
);

planTemplateSchema.plugin(softDeletePlugin);
planTemplateSchema.plugin(auditPlugin);
planTemplateSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('PlanTemplateItem', planTemplateSchema);
