// Module-facing entry point. The shared definition lets authorization middleware
// write security events without depending on the account module.
module.exports = require('../../shared/deniedAccess').DeniedAccessLog;
