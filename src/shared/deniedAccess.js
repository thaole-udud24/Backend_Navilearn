const mongoose = require('mongoose');

const deniedAccessLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    role: { type: String, required: true, index: true },
    method: { type: String, required: true },
    path: { type: String, required: true, index: true },
    requiredRoles: { type: [String], default: [] },
    reason: { type: String, default: 'Insufficient role' },
    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

deniedAccessLogSchema.index({ createdAt: -1 });
const DeniedAccessLog = mongoose.model('DeniedAccessLog', deniedAccessLogSchema);

async function recordDenied(req, requiredRoles, reason = 'Insufficient role') {
  if (!req.user || mongoose.connection.readyState !== 1) return;
  await DeniedAccessLog.create({
    user: req.user.id,
    role: req.user.role,
    method: req.method,
    path: req.originalUrl || req.path,
    requiredRoles,
    reason,
    ip: req.ip,
    userAgent: req.get('user-agent') || '',
  });
}

module.exports = { DeniedAccessLog, recordDenied };
