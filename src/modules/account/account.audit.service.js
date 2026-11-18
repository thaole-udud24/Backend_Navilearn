const logger = require('../../config/logger');
const AuditLog = require('./account.audit.model');

/** Records one admin action (BR-29). Other modules can reuse this. Never throws: auditing must not break the request. */
async function record({ actorId, action, targetType = '', targetId = '', meta = {}, ip = '' }) {
  try {
    await AuditLog.create({ actor: actorId, action, targetType, targetId: String(targetId), meta, ip });
  } catch (err) {
    logger.error({ err, action }, 'Failed to write audit log');
  }
}

module.exports = { record };
