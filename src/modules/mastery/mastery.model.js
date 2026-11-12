const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// Mastery is derived data: written only by assessment.service after grading, never by a direct API call.
const masterySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },
    score: { type: Number, default: 0, min: 0, max: 100 },
    level: { type: String, enum: ['novice', 'developing', 'proficient', 'mastered'], default: 'novice' },
    attemptsCount: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
  },
  { timestamps: true },
);

masterySchema.plugin(softDeletePlugin);
masterySchema.plugin(auditPlugin);
masterySchema.index({ owner: 1, concept: 1 }, { unique: true });

module.exports = mongoose.model('MasteryItem', masterySchema);
