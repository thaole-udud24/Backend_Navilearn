const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// Bộ thẻ ghi nhớ (deck) — admin-authored, shared content (AD-05c).
const deckSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { timestamps: true },
);

deckSchema.plugin(softDeletePlugin);
deckSchema.plugin(auditPlugin);
deckSchema.index({ status: 1, concept: 1, createdAt: -1 });

const FlashcardDeckItem = mongoose.model('FlashcardDeckItem', deckSchema);

// Thẻ ghi nhớ — mặt trước/sau; `deck` scopes it to one bộ thẻ.
const cardSchema = new mongoose.Schema(
  {
    deck: { type: mongoose.Schema.Types.ObjectId, ref: 'FlashcardDeckItem', required: true },
    front: { type: String, required: true, trim: true, maxlength: 1000 },
    back: { type: String, required: true, trim: true, maxlength: 1000 },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { timestamps: true },
);

cardSchema.plugin(softDeletePlugin);
cardSchema.plugin(auditPlugin);
cardSchema.index({ deck: 1, status: 1, createdAt: -1 });

const FlashcardItem = mongoose.model('FlashcardItem', cardSchema);

module.exports = { FlashcardDeckItem, FlashcardItem };
