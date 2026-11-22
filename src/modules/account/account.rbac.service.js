const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const User = require('./account.auth.model');
const AuditLog = require('./account.audit.model');
const auditService = require('./account.audit.service');
const { ROLES } = require('../../shared/roles');
const { PERMISSION_MATRIX } = require('../../shared/permission-matrix');

const ROLE_DESCRIPTIONS = {
  [ROLES.STUDENT]: 'Truy cập và quản lý dữ liệu học tập của chính mình.',
  [ROLES.ADMIN]: 'Quản trị tài khoản, nội dung và cấu hình hệ thống; không truy cập nội dung học tập cá nhân của sinh viên (BR-02).',
};

// UC-RBAC-01: hai vai trò cố định kèm mô tả và số tài khoản đang giữ vai trò.
async function getRoleCatalog() {
  const counts = await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]);
  const countByRole = Object.fromEntries(counts.map((c) => [c._id, c.count]));
  return Object.values(ROLES).map((role) => ({
    role,
    description: ROLE_DESCRIPTIONS[role] || '',
    accountCount: countByRole[role] || 0,
  }));
}

// UC-RBAC-02: ma trận phân quyền chức năng, có thể lọc theo vai trò.
function getPermissionMatrix(roleFilter) {
  if (!roleFilter) return PERMISSION_MATRIX;
  return PERMISSION_MATRIX.map((row) => ({
    module: row.module,
    name: row.name,
    roles: { [roleFilter]: row.roles[roleFilter] },
  }));
}

// UC-RBAC-03: quyền hiệu lực của một tài khoản cụ thể (vai trò + trạng thái hiện tại).
async function getEffectivePermissions(accountId) {
  const user = await User.findById(accountId);
  if (!user) throw ApiError.notFound('Tài khoản không tồn tại');

  const effective = user.isActive
    ? PERMISSION_MATRIX.map((row) => ({ module: row.module, name: row.name, permission: row.roles[user.role] }))
    : [];

  return {
    accountId: String(user._id),
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    permissions: effective,
    note: user.isActive ? undefined : 'Tài khoản đang bị khoá - không còn quyền hiệu lực nào.',
  };
}

// UC-RBAC-04: xuất ma trận phân quyền ra CSV, có thể lọc theo vai trò; ghi nhật ký thao tác (BR-29).
async function exportPermissionMatrix(roleFilter, actorId) {
  const rows = getPermissionMatrix(roleFilter);
  const roleColumns = roleFilter ? [roleFilter] : Object.values(ROLES);
  const header = ['module', 'name', ...roleColumns];
  const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = rows.map((row) => header.map((h) => esc(h in row ? row[h] : row.roles[h])).join(','));

  await auditService.record({ actorId, action: 'export_permission_matrix', targetType: 'rbac', meta: { roleFilter: roleFilter || 'all' } });

  return '﻿' + [header.join(','), ...lines].join('\n');
}

// UC-RBAC-05: nhật ký truy cập bị từ chối, lọc theo khoảng thời gian.
async function getDeniedAccessLog(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { action: 'access_denied' };
  if (query.from || query.to) {
    filter.createdAt = {};
    if (query.from) filter.createdAt.$gte = new Date(query.from);
    if (query.to) filter.createdAt.$lte = new Date(query.to);
  }
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('actor', 'email fullName role'),
    AuditLog.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

module.exports = {
  getRoleCatalog,
  getPermissionMatrix,
  getEffectivePermissions,
  exportPermissionMatrix,
  getDeniedAccessLog,
};
