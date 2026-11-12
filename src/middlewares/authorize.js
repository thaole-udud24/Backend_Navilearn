const ApiError = require('../utils/ApiError');

/** RBAC gate: only the given roles (e.g. 'student', 'admin') may pass. Ownership checks stay in the service. */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden('Insufficient role'));
  return next();
};

module.exports = authorize;
