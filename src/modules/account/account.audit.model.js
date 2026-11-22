// Moved to src/shared/audit-log.js so middlewares (which can't import modules/) can write to it
// directly too. Re-exported here so existing imports of this path keep working.
module.exports = require('../../shared/audit-log').AuditLog;
