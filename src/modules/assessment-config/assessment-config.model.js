const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// An assessment config is a quiz/exercise definition: a set of questions for one concept.
const assessmentConfigSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'QuestionItem', required: true }],
    passScore: { type: Number, default: 50, min: 0, max: 100 },
    timeLimitMinutes: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { timestamps: true },
);

assessmentConfigSchema.plugin(softDeletePlugin);
assessmentConfigSchema.plugin(auditPlugin);
assessmentConfigSchema.index({ concept: 1, status: 1 });

module.exports = mongoose.model('AssessmentConfigItem', assessmentConfigSchema);
