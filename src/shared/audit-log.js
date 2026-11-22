const mongoose = require('mongoose');
const logger = require('../config/logger');

// BR-29: every ADMIN action that changes shared data/config/accounts, and every denied-access
// attempt (UC-RBAC-05), is logged here. Lives in shared/ (not modules/account) so middlewares can
// write to it directly without crossing the modules import boundary (see .eslintrc.json).
const auditLogSchema = new mongoose.Schema(
  {
    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    action: { type: String, required: true, index: true },
    targetType: { type: String, default: '' },
    targetId: { type: String, default: '' },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    ip: { type: String, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

/**
 * Records one action. Never throws: auditing must not break the request.
 * Skips the write (instead of letting mongoose buffer it indefinitely) when there is no live DB
 * connection, e.g. unit tests that exercise the HTTP layer without a real Mongo running.
 */
async function record({ actorId, action, targetType = '', targetId = '', meta = {}, ip = '' }) {
  if (mongoose.connection.readyState !== 1) return;
  try {
    await AuditLog.create({ actor: actorId, action, targetType, targetId: String(targetId), meta, ip });
  } catch (err) {
    logger.error({ err, action }, 'Failed to write audit log');
  }
}

module.exports = { AuditLog, record };
