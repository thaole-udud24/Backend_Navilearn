const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

const WEIGHT_SUM_EPSILON = 0.01;

const criterionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    // % of the rubric's totalPoints this criterion is worth; all criteria must sum to 100.
    weightPct: { type: Number, required: true, min: 0.01, max: 100 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
  },
  { _id: false },
);

// Grading rubric for essay questions (UC-ACF-07..10); ai-assist.service grades against it when present.
const rubricSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },
    // The point scale weightPct applies to (e.g. 100 => a criterion with weightPct 30 is worth 30 points).
    totalPoints: { type: Number, required: true, min: 1, max: 1000, default: 100 },
    criteria: {
      type: [criterionSchema],
      validate: { validator: (v) => v.length > 0, message: 'A rubric needs at least 1 criterion' },
    },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    source: { type: String, enum: ['manual', 'ai', 'import'], default: 'manual' },
  },
  { timestamps: true },
);

rubricSchema.pre('validate', function enforceWeightSum(next) {
  if (!this.criteria || this.criteria.length === 0) return next();
  const sum = this.criteria.reduce((s, c) => s + (c.weightPct || 0), 0);
  if (Math.abs(sum - 100) > WEIGHT_SUM_EPSILON) {
    this.invalidate('criteria', `Criteria weightPct must sum to 100 (got ${sum})`);
  }
  return next();
});

rubricSchema.plugin(softDeletePlugin);
rubricSchema.plugin(auditPlugin);
rubricSchema.index({ concept: 1, status: 1 });

module.exports = mongoose.model('Rubric', rubricSchema);
