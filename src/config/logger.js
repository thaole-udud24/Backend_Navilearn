const pino = require('pino');
const env = require('./env');

const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
});

module.exports = logger;
