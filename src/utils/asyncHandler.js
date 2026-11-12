// Wraps async controllers so rejected promises reach errorHandler instead of crashing.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = asyncHandler;
