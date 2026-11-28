const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// Per-student spaced-repetition state for one flashcard (SM-2-style). One row per (owner, card),
// created lazily on first review/due-check — no row means the card is untouched ("new").
const cardStateSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    card: { type: mongoose.Schema.Types.ObjectId, ref: 'FlashcardItem', required: true },
    // Denormalized from card.deck at creation time so listDue/getStats can scope by deck without a join.
    deck: { type: mongoose.Schema.Types.ObjectId, ref: 'FlashcardDeckItem', required: true },
    status: { type: String, enum: ['new', 'learning', 'review'], default: 'new' },
    easeFactor: { type: Number, default: 2.5 },
    intervalDays: { type: Number, default: 0 },
    reps: { type: Number, default: 0 },
    lapses: { type: Number, default: 0 },
    dueAt: { type: Date, default: Date.now }, // new cards are due immediately
    lastReviewedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

cardStateSchema.plugin(softDeletePlugin);
cardStateSchema.plugin(auditPlugin);
cardStateSchema.index({ owner: 1, card: 1 }, { unique: true });
cardStateSchema.index({ owner: 1, dueAt: 1 });

module.exports = mongoose.model('CardState', cardStateSchema);
