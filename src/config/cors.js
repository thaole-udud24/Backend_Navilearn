const env = require('./env');

module.exports = {
  origin: env.CORS_ORIGIN.split(',').map((s) => s.trim()),
  credentials: true,
};
