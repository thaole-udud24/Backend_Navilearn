const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const User = require('./account.auth.model');
const DeniedAccessLog = require('./account.rbac.model');
const audit = require('./account.audit.service');
const { toCsv } = require('./account.csv');
const { ROLE_CATALOG, PERMISSION_MATRIX, effectivePermissions } = require('./account.rbac.permissions');

async function listRoles() {
  const counts = await User.aggregate([
    { $group: { _id: '$role', total: { $sum: 1 }, active: { $sum: { $cond: ['$isActive', 1, 0] } } } },
  ]);
  const countByRole = Object.fromEntries(counts.map((item) => [item._id, item]));
  return ROLE_CATALOG.map((role) => ({
    ...role,
    totalUsers: countByRole[role.code]?.total || 0,
    activeUsers: countByRole[role.code]?.active || 0,
  }));
}

function matrix(query = {}) {
  const search = query.search?.trim().toLocaleLowerCase('vi');
  return PERMISSION_MATRIX.filter((row) => {
    if (query.role && row[query.role] === 'none') return false;
    if (query.module && row.module !== query.module) return false;
    return !search || `${row.module} ${row.capability}`.toLocaleLowerCase('vi').includes(search);
  });
}

async function effective(userId) {
  const user = await User.findById(userId).select('email fullName role isActive emailVerified');
  if (!user) throw ApiError.notFound('Không tìm thấy tài khoản');
  return {
    user: {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
    },
    permissions: user.isActive ? effectivePermissions(user.role) : [],
  };
}

async function exportMatrix(query, actor) {
  const rows = matrix(query);
  await audit.record({
    actorId: actor.id,
    action: 'rbac.matrix.export',
    targetType: 'rbac',
    meta: { count: rows.length, query },
    ip: actor.ip,
  });
  return toCsv(rows, [
    { header: 'Module', value: (row) => row.module },
    { header: 'Chức năng', value: (row) => row.capability },
    { header: 'Sinh viên', value: (row) => row.student },
    { header: 'Quản trị viên', value: (row) => row.admin },
  ]);
}

async function deniedLogs(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.role) filter.role = query.role;
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(`${query.to}T23:59:59.999Z`);
  }
  const [items, total] = await Promise.all([
    DeniedAccessLog.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('user', 'email fullName'),
    DeniedAccessLog.countDocuments(filter),
  ]);
  return {
    items: items.map((item) => ({
      id: item.id,
      user: item.user ? { id: item.user.id, email: item.user.email, fullName: item.user.fullName } : null,
      role: item.role,
      method: item.method,
      path: item.path,
      requiredRoles: item.requiredRoles,
      reason: item.reason,
      ip: item.ip,
      userAgent: item.userAgent,
      createdAt: item.createdAt,
    })),
    meta: buildMeta(page, limit, total),
  };
}

module.exports = { listRoles, matrix, effective, exportMatrix, deniedLogs };
