const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// UC-ADP-02: a learning activity the student started from the Next Best Action recommendation.
const activitySchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },
    priority: { type: Number, required: true },
    reason: { type: String, required: true },
  },
  { timestamps: true },
);

activitySchema.plugin(softDeletePlugin);
activitySchema.plugin(auditPlugin);
activitySchema.index({ owner: 1, createdAt: -1 });
module.exports = mongoose.model('AdaptiveActivity', activitySchema);
