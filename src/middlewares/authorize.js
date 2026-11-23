const ApiError = require('../utils/ApiError');

/** RBAC gate: only the given roles (e.g. 'student', 'admin') may pass. Ownership checks stay in the service. */
const authorize =
  (...roles) =>
  (req, res, next) => {
    if (!req.user) return next(ApiError.unauthorized());
    if (!roles.includes(req.user.role)) {
      const err = ApiError.forbidden('Insufficient role');
      // UC-RBAC-05: errorHandler.js logs every 403 centrally; this just carries which roles were
      // actually required so that log entry isn't stuck with an empty requiredRoles array.
      err.requiredRoles = roles;
      return next(err);
    }
    return next();
  };

module.exports = authorize;
