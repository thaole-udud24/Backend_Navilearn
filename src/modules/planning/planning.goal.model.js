const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// BIZ-PLN-03: goals & deadlines. Feeds deadline urgency / importance in adaptive.priority.js (importance 1-5, divide by 5 there).
const goalSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    deadline: { type: Date, required: true },
    importance: { type: Number, min: 1, max: 5, default: 3 },
  },
  { timestamps: true },
);

goalSchema.plugin(softDeletePlugin);
goalSchema.plugin(auditPlugin);
goalSchema.index({ owner: 1, deadline: 1 });

module.exports = mongoose.model('PlanningGoal', goalSchema);