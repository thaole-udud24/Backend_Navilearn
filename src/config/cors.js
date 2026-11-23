const env = require('./env');

const allowedOrigins = env.CORS_ORIGIN.split(',').map((s) => s.trim());
// Vite picks the next free port (5174, 5175...) when 5173 is already taken by another running
// instance, so a fixed origin list keeps breaking CORS for no reason — any localhost/127.0.0.1
// port is trusted in dev; production still only allows the exact origins from CORS_ORIGIN.
const isLocalDevOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);

module.exports = {
  origin:
    env.NODE_ENV === 'development'
      ? (origin, cb) => cb(null, !origin || isLocalDevOrigin(origin) || allowedOrigins.includes(origin))
      : allowedOrigins,
  credentials: true,
};
