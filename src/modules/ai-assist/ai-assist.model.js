const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

const sourceSchema = new mongoose.Schema(
  {
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },
    label: { type: String, trim: true, maxlength: 200, default: '' },
  },
  { _id: false },
);

// Audit log of every AI-assisted action (question generation, grading, Q&A, ...) for traceability.
const aiAssistLogSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', default: null },
    kind: {
      type: String,
      enum: [
        'generate_question',
        'practice_question',
        'grade_essay',
        'qa',
        'explain_wrong',
        'essay_feedback',
      ],
      required: true,
    },
    prompt: { type: String, required: true, maxlength: 4000 },
    response: { type: String, required: true, maxlength: 4000 },
    sources: { type: [sourceSchema], default: [] },
    valid: { type: Boolean, default: true }, // UC-AP-AIA-04: format/answer check, for generated questions
    approvedQuestion: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionItem', default: null },
    rating: { type: Number, min: 1, max: 5, default: null },
    ratingComment: { type: String, trim: true, maxlength: 1000, default: '' },
    reported: { type: Boolean, default: false },
    reportReason: { type: String, trim: true, maxlength: 1000, default: '' },
    reportedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

aiAssistLogSchema.plugin(softDeletePlugin);
aiAssistLogSchema.plugin(auditPlugin);
aiAssistLogSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('AiAssistItem', aiAssistLogSchema);
