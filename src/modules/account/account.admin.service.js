const bcrypt = require('bcryptjs');
const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { ROLES } = require('../../shared/roles');
const User = require('./account.auth.model');
const LoginLog = require('./account.loginlog.model');
const AuditLog = require('./account.audit.model');
const audit = require('./account.audit.service');
const tokens = require('./account.token.service');
const { toAdminUser } = require('./account.public');
const { assertPassword } = require('./account.password.policy');
const { revokeAllSessions } = require('./account.session.service');
const { purgeUserData } = require('./account.purge');
const { toCsv } = require('./account.csv');

const EXPORT_LIMIT = 5000;
const RESET_LINK_MINUTES = 60;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildFilter(query) {
  const filter = {};
  if (query.search) {
    const re = new RegExp(escapeRegex(query.search), 'i');
    filter.$or = [{ email: re }, { fullName: re }];
  }
  if (query.role) filter.role = query.role;
  if (query.status === 'active') Object.assign(filter, { isActive: true, emailVerified: true });
  if (query.status === 'locked') filter.isActive = false;
  if (query.status === 'unverified') Object.assign(filter, { isActive: true, emailVerified: false });
  return filter;
}

async function loadUser(id) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

/** BR-30: there must always be at least one active ADMIN left after the change. */
async function assertNotLastAdmin(user) {
  if (user.role !== ROLES.ADMIN || !user.isActive) return;
  const others = await User.countDocuments({ role: ROLES.ADMIN, isActive: true, _id: { $ne: user.id } });
  if (others === 0) {
    throw ApiError.conflict('Hệ thống phải luôn còn ít nhất một quản trị viên đang hoạt động', 'LAST_ADMIN');
  }
}

/** BIZ-ACC-02 */
async function list(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = buildFilter(query);
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return { items: items.map(toAdminUser), meta: buildMeta(page, limit, total) };
}

async function exportCsv(query, actor) {
  const items = await User.find(buildFilter(query)).sort({ createdAt: -1 }).limit(EXPORT_LIMIT);
  await audit.record({
    actorId: actor.id,
    action: 'user.export',
    targetType: 'user',
    meta: { count: items.length, query },
    ip: actor.ip,
  });
  return toCsv(items.map(toAdminUser), [
    { header: 'Họ tên', value: (u) => u.fullName },
    { header: 'Email', value: (u) => u.email },
    { header: 'Vai trò', value: (u) => u.role },
    {
      header: 'Trạng thái',
      value: (u) => (!u.isActive ? 'Đã khóa' : u.emailVerified ? 'Hoạt động' : 'Chưa xác minh'),
    },
    { header: 'Lý do khóa', value: (u) => u.lockReason || '' },
    { header: 'Đăng nhập gần nhất', value: (u) => (u.lastLoginAt ? u.lastLoginAt.toISOString() : '') },
    { header: 'Ngày tạo', value: (u) => u.createdAt.toISOString() },
  ]);
}

async function getById(id) {
  return toAdminUser(await loadUser(id));
}

/** BIZ-ACC-05: new account is Active straight away (the ADMIN vouches for the email). */
async function create(actor, { email, fullName, role, password }) {
  if (await User.findOne({ email })) throw ApiError.conflict('Email already registered', 'EMAIL_EXISTS');
  assertPassword(password, { email, fullName });
  const user = await User.create({
    email,
    fullName,
    role,
    passwordHash: await bcrypt.hash(password, 10),
    emailVerified: true,
  });
  await audit.record({
    actorId: actor.id,
    action: 'user.create',
    targetType: 'user',
    targetId: user.id,
    meta: { email, role },
    ip: actor.ip,
  });
  return toAdminUser(user);
}

/** BIZ-ACC-07 */
async function update(actor, id, data) {
  const user = await loadUser(id);
  const before = { email: user.email, fullName: user.fullName, role: user.role };

  if (data.email && data.email !== user.email) {
    if (await User.findOne({ email: data.email, _id: { $ne: user.id } })) {
      throw ApiError.conflict('Email already registered', 'EMAIL_EXISTS');
    }
    user.email = data.email;
  }
  if (data.fullName) user.fullName = data.fullName;

  const roleChanged = data.role && data.role !== user.role;
  if (roleChanged) {
    await assertNotLastAdmin(user); // demoting the last admin
    user.role = data.role;
  }
  await user.save();
  // Tokens carry the role, so a role change must force a fresh login.
  if (roleChanged) await revokeAllSessions(user.id);

  await audit.record({
    actorId: actor.id,
    action: 'user.update',
    targetType: 'user',
    targetId: user.id,
    meta: { before, after: { email: user.email, fullName: user.fullName, role: user.role } },
    ip: actor.ip,
  });
  return toAdminUser(user);
}

/** BIZ-ACC-10: blocks sign-in but keeps all data. */
async function lock(actor, id, { reason }) {
  const user = await loadUser(id);
  if (user.id === actor.id)
    throw ApiError.badRequest('Bạn không thể tự khóa tài khoản của mình', 'CANNOT_LOCK_SELF');
  await assertNotLastAdmin(user);
  user.isActive = false;
  user.lockReason = reason;
  user.lockedAt = new Date();
  await user.save();
  await revokeAllSessions(user.id);
  await audit.record({
    actorId: actor.id,
    action: 'user.lock',
    targetType: 'user',
    targetId: user.id,
    meta: { reason },
    ip: actor.ip,
  });
  return toAdminUser(user);
}

/** BIZ-ACC-08 */
async function unlock(actor, id) {
  const user = await loadUser(id);
  user.isActive = true;
  user.lockReason = null;
  user.lockedAt = null;
  user.failedAttempts = 0;
  user.lockUntil = null;
  await user.save();
  await audit.record({
    actorId: actor.id,
    action: 'user.unlock',
    targetType: 'user',
    targetId: user.id,
    ip: actor.ip,
  });
  return toAdminUser(user);
}

/** BIZ-ACC-12 / BR-26: permanent. For students all their learning data goes with the account. */
async function remove(actor, id) {
  const user = await loadUser(id);
  if (user.id === actor.id)
    throw ApiError.badRequest('Bạn không thể tự xóa tài khoản của mình', 'CANNOT_DELETE_SELF');
  await assertNotLastAdmin(user);
  // An ADMIN's records (question bank, concepts...) are shared content and must survive; only students own personal data.
  const purged = user.role === ROLES.STUDENT ? await purgeUserData(user.id) : {};
  await revokeAllSessions(user.id);
  await user.deleteOne();
  await audit.record({
    actorId: actor.id,
    action: 'user.delete',
    targetType: 'user',
    targetId: id,
    meta: { email: user.email, role: user.role, purged },
    ip: actor.ip,
  });
}

/** BIZ-ACC-04: login history. */
async function loginLogs(id, query) {
  await loadUser(id);
  const { page, limit, skip } = parsePagination(query);
  const filter = { user: id };
  const [items, total] = await Promise.all([
    LoginLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    LoginLog.countDocuments(filter),
  ]);
  return {
    items: items.map((l) => ({
      id: l.id,
      success: l.success,
      reason: l.reason,
      ip: l.ip,
      userAgent: l.userAgent,
      createdAt: l.createdAt,
    })),
    meta: buildMeta(page, limit, total),
  };
}

/** BIZ-ACC-04: mail a one-hour password reset link to the user. */
async function sendResetLink(actor, id) {
  const user = await loadUser(id);
  if (!user.isActive) throw ApiError.conflict('Tài khoản đang bị khóa', 'ACCOUNT_LOCKED');
  const ticket = await tokens.issueResetTicket(user, RESET_LINK_MINUTES);
  await tokens.sendResetLinkMail(user, ticket, RESET_LINK_MINUTES);
  await audit.record({
    actorId: actor.id,
    action: 'user.send-reset',
    targetType: 'user',
    targetId: user.id,
    ip: actor.ip,
  });
  return { sent: true };
}

/** BR-29: the admin action log. */
async function auditLogs(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = query.action ? { action: query.action } : {};
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('actor', 'email fullName'),
    AuditLog.countDocuments(filter),
  ]);
  return {
    items: items.map((a) => ({
      id: a.id,
      action: a.action,
      targetType: a.targetType,
      targetId: a.targetId,
      meta: a.meta,
      actor: a.actor ? { id: a.actor.id, email: a.actor.email, fullName: a.actor.fullName } : null,
      createdAt: a.createdAt,
    })),
    meta: buildMeta(page, limit, total),
  };
}

module.exports = {
  list,
  exportCsv,
  getById,
  create,
  update,
  lock,
  unlock,
  remove,
  loginLogs,
  sendResetLink,
  auditLogs,
};
