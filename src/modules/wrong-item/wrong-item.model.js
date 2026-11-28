const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// One row per (owner, question) the student has ever answered wrong, aggregated across attempts
// (practice or assessment — both go through AssessmentItem). "concept" is denormalized from the
// question at record time so the notebook can be filtered by concept without a join.
const wrongItemSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionItem', required: true },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },
    wrongCount: { type: Number, default: 1 },
    lastWrongAt: { type: Date, default: Date.now },
    status: { type: String, enum: ['open', 'mastered'], default: 'open' },
  },
  { timestamps: true },
);

wrongItemSchema.plugin(softDeletePlugin);
wrongItemSchema.plugin(auditPlugin);
wrongItemSchema.index({ owner: 1, question: 1 }, { unique: true });
wrongItemSchema.index({ owner: 1, status: 1, concept: 1 });

module.exports = mongoose.model('WrongItem', wrongItemSchema);
