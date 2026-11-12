const mongoose = require('mongoose');
const auditPlugin = require('../../plugins/audit.plugin');

// Audit log of every AI-assisted action (question generation, essay grading) for traceability.
const aiAssistLogSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', default: null },
    kind: { type: String, enum: ['generate_question', 'grade_essay'], required: true },
    prompt: { type: String, required: true, maxlength: 4000 },
    response: { type: String, required: true, maxlength: 4000 },
  },
  { timestamps: true },
);

aiAssistLogSchema.plugin(auditPlugin);
aiAssistLogSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('AiAssistItem', aiAssistLogSchema);
