const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const { ROLES } = require('../../shared/roles');
const User = require('./account.auth.model');
const Session = require('./account.session.model');
const { toProfile } = require('./account.public');
const { assertPassword } = require('./account.password.policy');
const { revokeAllSessions } = require('./account.session.service');
const { purgeUserData } = require('./account.purge');

const AVATAR_DIR = path.resolve(env.STORAGE_UPLOAD_DIR, 'avatars');

async function loadUser(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function getProfile(userId) {
  return toProfile(await loadUser(userId));
}

/** BIZ-ACC-01. Email is not editable here: BR-56 only allows changing it through verification. */
async function updateProfile(userId, data) {
  const user = await loadUser(userId);
  ['fullName', 'locale', 'timezone', 'learningGoal'].forEach((key) => {
    if (data[key] !== undefined) user[key] = data[key];
  });
  if (data.availability) {
    Object.entries(data.availability).forEach(([day, minutes]) => {
      user.set(`availability.${day}`, minutes);
    });
  }
  await user.save();
  return toProfile(user);
}

function removeLocalAvatar(avatarUrl) {
  if (!avatarUrl || !avatarUrl.startsWith('/uploads/avatars/')) return;
  const file = path.join(AVATAR_DIR, path.basename(avatarUrl));
  fs.promises.unlink(file).catch(() => {});
}

async function setAvatar(userId, file) {
  if (!file) throw ApiError.badRequest('Vui lòng chọn ảnh (png, jpg, webp)', 'FILE_REQUIRED');
  const user = await loadUser(userId);
  const previous = user.avatarUrl;
  user.avatarUrl = `/uploads/avatars/${file.filename}`;
  await user.save();
  removeLocalAvatar(previous);
  return toProfile(user);
}

/** BIZ-ACC-09 / BR-49: changing the password signs out every other session. */
async function changePassword(userId, currentSid, { currentPassword, newPassword }) {
  const user = await loadUser(userId);
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw ApiError.badRequest('Mật khẩu hiện tại không đúng', 'WRONG_PASSWORD', [
      { field: 'currentPassword', message: 'Mật khẩu hiện tại không đúng' },
    ]);
  }
  if (currentPassword === newPassword) {
    throw ApiError.badRequest('Mật khẩu mới phải khác mật khẩu cũ', 'SAME_PASSWORD', [
      { field: 'newPassword', message: 'Mật khẩu mới phải khác mật khẩu cũ' },
    ]);
  }
  assertPassword(newPassword, { email: user.email, fullName: user.fullName });
  user.passwordHash = await bcrypt.hash(newPassword, 10);
  await user.save();
  await revokeAllSessions(user.id, currentSid);
  return { changed: true };
}

/** BIZ-ACC-03 */
async function listSessions(userId, currentSid) {
  const items = await Session.find({ user: userId }).sort({ lastUsedAt: -1 });
  return items.map((s) => ({
    id: s.id,
    userAgent: s.userAgent,
    ip: s.ip,
    createdAt: s.createdAt,
    lastUsedAt: s.lastUsedAt,
    current: String(s.id) === String(currentSid),
  }));
}

async function revokeSession(userId, sessionId) {
  const { deletedCount } = await Session.deleteOne({ _id: sessionId, user: userId });
  if (!deletedCount) throw ApiError.notFound('Session not found');
}

async function revokeOtherSessions(userId, currentSid) {
  const { deletedCount } = await revokeAllSessions(userId, currentSid);
  return { revoked: deletedCount };
}

/** BIZ-ACC-11 / BR-26: a student deletes their own account and everything linked to it. */
async function deleteAccount(userId, { password }) {
  const user = await loadUser(userId);
  // BR-30: an ADMIN account is removed by another ADMIN, never by itself.
  if (user.role !== ROLES.STUDENT) throw ApiError.forbidden('Chỉ sinh viên mới được tự xóa tài khoản');
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    throw ApiError.badRequest('Mật khẩu không đúng', 'WRONG_PASSWORD', [{ field: 'password', message: 'Mật khẩu không đúng' }]);
  }
  await purgeUserData(user.id);
  await user.deleteOne();
}

module.exports = {
  getProfile,
  updateProfile,
  setAvatar,
  changePassword,
  listSessions,
  revokeSession,
  revokeOtherSessions,
  deleteAccount,
  AVATAR_DIR,
};
