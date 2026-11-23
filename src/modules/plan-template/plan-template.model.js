const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// One step of a template plan: relative to the day the student applies the template, not an
// absolute date, since the same template is reused by many students at different times.
const stepSchema = new mongoose.Schema(
  {
    dayOffset: { type: Number, required: true, min: 1, max: 60 },
    durationMin: { type: Number, required: true, min: 5, max: 480 },
    note: { type: String, trim: true, maxlength: 300 },
    // UC-PLN-TPL-03: a step is a real mini-lesson, not just a label — theory to read, then
    // questions to check understanding before the student can mark it done.
    theoryContent: { type: String, trim: true, maxlength: 8000, default: '' },
    questions: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'QuestionItem' }], default: [] },
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
    isActive: { type: Boolean, default: true },
    source: { type: String, enum: ['manual', 'ai', 'import'], default: 'manual' },
  },
  { timestamps: true },
);

planTemplateSchema.plugin(softDeletePlugin);
planTemplateSchema.plugin(auditPlugin);
planTemplateSchema.index({ isActive: 1, createdAt: -1 });

module.exports = mongoose.model('PlanTemplateItem', planTemplateSchema);
