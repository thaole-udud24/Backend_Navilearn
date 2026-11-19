const mongoose = require('mongoose');

// BIZ-ACC-04: login history an ADMIN can review. Never stores passwords.
const loginLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    email: { type: String, default: '' },
    success: { type: Boolean, required: true },
    reason: { type: String, default: '' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

loginLogSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('LoginLog', loginLogSchema);
