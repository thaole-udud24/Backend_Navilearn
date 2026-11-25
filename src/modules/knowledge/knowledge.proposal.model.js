const mongoose = require('mongoose');
const auditPlugin = require('../../plugins/audit.plugin');
const { LEVEL_ORDER } = require('./knowledge.helpers');

// A structure suggested by the AI for one of the student's courses. Nothing reaches the student's real
// structure until they confirm it (UC-KNW-13) — or it is rejected (UC-KNW-14).
const proposalNodeSchema = new mongoose.Schema(
  {
    ref: { type: String, required: true }, // temporary id used by parentRef
    parentRef: { type: String, default: null },
    level: { type: String, enum: LEVEL_ORDER, required: true },
    name: { type: String, required: true, maxlength: 200 },
    description: { type: String, default: '', maxlength: 2000 },
  },
  { _id: false },
);

const proposalSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentSubject: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentSubjectItem', required: true },
    summary: { type: String, default: '', maxlength: 2000 },
    nodes: { type: [proposalNodeSchema], default: [] },
    status: { type: String, enum: ['pending', 'confirmed', 'rejected'], default: 'pending' },
    decidedAt: { type: Date, default: null },
    createdNodeCount: { type: Number, default: 0 },
  },
  { timestamps: true },
);

proposalSchema.plugin(auditPlugin);
proposalSchema.index({ owner: 1, studentSubject: 1, createdAt: -1 });

module.exports = mongoose.model('KnowledgeProposal', proposalSchema);
