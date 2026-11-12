const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

const answerSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionItem', required: true },
    selectedOptionIndex: { type: Number, default: null },
    essayText: { type: String, trim: true, maxlength: 4000, default: '' },
    isCorrect: { type: Boolean, default: false },
    earnedPoints: { type: Number, default: 0 },
    feedback: { type: String, default: '' },
  },
  { _id: false },
);

// One attempt of a student at an assessment config.
const assessmentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assessmentConfig: { type: mongoose.Schema.Types.ObjectId, ref: 'AssessmentConfigItem', required: true },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },
    answers: { type: [answerSchema], default: [] },
    status: { type: String, enum: ['in_progress', 'submitted'], default: 'in_progress' },
    score: { type: Number, default: 0, min: 0, max: 100 },
    passed: { type: Boolean, default: false },
    startedAt: { type: Date, default: Date.now },
    submittedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

assessmentSchema.plugin(softDeletePlugin);
assessmentSchema.plugin(auditPlugin);
assessmentSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('AssessmentItem', assessmentSchema);
