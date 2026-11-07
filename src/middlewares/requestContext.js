const pinoHttp = require('pino-http');
const logger = require('../config/logger');

// Attaches req.log and logs each request/response once, with no sensitive body fields.
module.exports = pinoHttp({ logger });
