const logger = require('../../config/logger');

// [ASSUMPTION] No mail provider specified in BRD; stub logs instead of sending until a provider is wired in.
async function sendMail({ to, subject, text: _text }) {
  logger.info({ to, subject }, 'sendMail (stub)');
  return { queued: true };
}

module.exports = { sendMail };
