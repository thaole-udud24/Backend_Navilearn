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
    // UC-ASM-08..11 are all "start an attempt" against a config of a given kind; the kind, not a
    // separate endpoint per UC, is what distinguishes placement/practice/chapter/mock tests.
    kind: {
      type: String,
      enum: ['placement', 'practice', 'chapter_test', 'mock_exam', 'independent_check'],
      default: 'practice',
    },
    retryPolicy: {
      maxAttempts: { type: Number, default: 0, min: 0 }, // 0 = unlimited
      cooldownMinutes: { type: Number, default: 0, min: 0 },
    },
    showAnswersPolicy: {
      type: String,
      enum: ['after_submit', 'after_due', 'never'],
      default: 'after_submit',
    },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { timestamps: true },
);

assessmentConfigSchema.plugin(softDeletePlugin);
assessmentConfigSchema.plugin(auditPlugin);
assessmentConfigSchema.index({ concept: 1, status: 1 });

module.exports = mongoose.model('AssessmentConfigItem', assessmentConfigSchema);
