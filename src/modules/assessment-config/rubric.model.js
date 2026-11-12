const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

const criterionSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    maxPoints: { type: Number, required: true, min: 1, max: 100 },
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
    criteria: {
      type: [criterionSchema],
      validate: { validator: (v) => v.length > 0, message: 'A rubric needs at least 1 criterion' },
    },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { timestamps: true },
);

rubricSchema.plugin(softDeletePlugin);
rubricSchema.plugin(auditPlugin);
rubricSchema.index({ concept: 1, status: 1 });

module.exports = mongoose.model('Rubric', rubricSchema);
