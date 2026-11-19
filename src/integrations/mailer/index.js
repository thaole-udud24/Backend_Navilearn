const nodemailer = require('nodemailer');
const env = require('../../config/env');
const logger = require('../../config/logger');

let transporter = null;

function getTransporter() {
  if (!env.SMTP_HOST) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
  }
  return transporter;
}

/**
 * Sends a mail through SMTP when SMTP_HOST is configured. Without SMTP (local dev/tests) the mail is only
 * logged — including its body outside production, so the OTP can be read from the server log.
 */
async function sendMail({ to, subject, text }) {
  const tx = getTransporter();
  if (!tx) {
    logger.info(env.NODE_ENV === 'production' ? { to, subject } : { to, subject, text }, 'sendMail (no SMTP, logged only)');
    return { queued: false };
  }
  await tx.sendMail({ from: env.MAIL_FROM, to, subject, text });
  return { queued: true };
}

module.exports = { sendMail };
