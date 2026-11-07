const ApiError = require('../utils/ApiError');
const logger = require('../config/logger');
const env = require('../config/env');

// Single place that turns any thrown error into a response. Never leak stack/internal info.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({
      success: false,
      message: err.message,
      code: err.code,
      errors: err.errors,
    });
  }

  logger.error({ err }, 'Unhandled error');
  return res.status(500).json({
    success: false,
    message: env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    code: 'INTERNAL_ERROR',
    errors: [],
  });
}

module.exports = errorHandler;
