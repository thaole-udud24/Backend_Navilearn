const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

const historyEntrySchema = new mongoose.Schema(
  {
    score: { type: Number, required: true },
    level: { type: String, required: true },
    reason: {
      type: String,
      enum: ['initial_grading', 'regrade', 'placement_init', 'content_completed'],
      required: true,
    },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const completedContentSchema = new mongoose.Schema(
  {
    contentRef: { type: String, required: true, trim: true, maxlength: 200 },
    completedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Mastery is mostly derived data: written by assessment.service after grading, plus a couple of
// direct student actions (goal, marking content complete).
const masterySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },
    score: { type: Number, default: 0, min: 0, max: 100 },
    level: { type: String, enum: ['novice', 'developing', 'proficient', 'mastered'], default: 'novice' },
    attemptsCount: { type: Number, default: 0 },
    correctCount: { type: Number, default: 0 },
    lastAttemptAt: { type: Date, default: null },
    goalScore: { type: Number, min: 0, max: 100, default: null }, // UC-MST-06
    completedContent: { type: [completedContentSchema], default: [] }, // UC-MST-07
    history: { type: [historyEntrySchema], default: [] }, // UC-MST-05, UC-AP-MST-04
  },
  { timestamps: true },
);

masterySchema.plugin(softDeletePlugin);
masterySchema.plugin(auditPlugin);
masterySchema.index({ owner: 1, concept: 1 }, { unique: true });

module.exports = mongoose.model('MasteryItem', masterySchema);
