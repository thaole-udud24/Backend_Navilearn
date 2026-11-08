const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// Concept: smallest knowledge unit that question bank / mastery are tracked against.
const conceptSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
  },
  { timestamps: true },
);

conceptSchema.plugin(softDeletePlugin);
conceptSchema.plugin(auditPlugin);
conceptSchema.index({ status: 1, order: 1 });

module.exports = mongoose.model('Concept', conceptSchema);
