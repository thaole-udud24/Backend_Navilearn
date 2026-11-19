const crypto = require('crypto');

const sha256 = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

/** Cryptographically random 6-digit code, zero padded. */
const generateOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const generateOpaqueToken = () => crypto.randomBytes(32).toString('hex');

/** Constant-time compare of two strings. */
function safeEqual(a, b) {
  const x = Buffer.from(String(a));
  const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

module.exports = { sha256, generateOtp, generateOpaqueToken, safeEqual };
