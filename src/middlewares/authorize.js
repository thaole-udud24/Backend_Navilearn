const ApiError = require('../utils/ApiError');
const { record } = require('../shared/audit-log');

/** RBAC gate: only the given roles (e.g. 'student', 'admin') may pass. Ownership checks stay in the service. */
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) {
    // UC-RBAC-05 / BR-29: ghi nhận mọi lần truy cập vượt quyền để ADMIN giám sát.
    record({
      actorId: req.user.id,
      action: 'access_denied',
      targetType: 'route',
      targetId: req.originalUrl,
      meta: { method: req.method, requiredRoles: roles, actualRole: req.user.role },
      ip: req.ip,
    });
    return next(ApiError.forbidden('Insufficient role'));
  }
  return next();
};

module.exports = authorize;
