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
const cloudinary = require('../../integrations/cloudinary');

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
  ['fullName', 'locale', 'timezone', 'learningGoal', 'notificationHour', 'defaultRestDays'].forEach((key) => {
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
  const localPath = file.path || path.join(AVATAR_DIR, file.filename);
  const cloudUrl = await cloudinary.uploadImageFile(localPath, 'navilearn/avatars', file.mimetype);
  user.avatarUrl = cloudUrl || `/uploads/avatars/${file.filename}`;
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
  const items = await Session.find({ user: userId }).sort({ lastUsedAt: -1 }).limit(5);
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
    throw ApiError.badRequest('Mật khẩu không đúng', 'WRONG_PASSWORD', [
      { field: 'password', message: 'Mật khẩu không đúng' },
    ]);
  }
  await purgeUserData(user.id);
  await user.deleteOne();
}

function toDayString(date = new Date()) {
  return new Date(date).toISOString().slice(0, 10);
}

// v2.1 §5.9: Chuỗi ngày học (Streak)
async function getStreak(userId, now = new Date()) {
  const user = await loadUser(userId);
  const today = toDayString(now);
  const yesterday = toDayString(new Date(now.getTime() - 86400000));
  const last = user.streak?.lastActiveDate ?? null;
  const rawCurrent = user.streak?.current ?? 0;
  // If student missed yesterday and hasn't studied today, current streak has reset to 0.
  const current = last === today || last === yesterday ? rawCurrent : 0;
  return {
    current,
    longest: user.streak?.longest ?? 0,
    lastActiveDate: last,
    activeToday: last === today,
  };
}

const STREAK_BADGES = [
  { code: 'STREAK_3', name: 'Khởi động bền bỉ', thresholdDays: 3 },
  { code: 'STREAK_7', name: 'Tuần lễ vàng', thresholdDays: 7 },
  { code: 'STREAK_14', name: 'Thói quen thép', thresholdDays: 14 },
  { code: 'STREAK_30', name: 'Bậc thầy kỷ luật', thresholdDays: 30 },
];

async function recordStudyActivity(userId, now = new Date()) {
  const user = await User.findById(userId);
  if (!user) return null;
  const today = toDayString(now);
  const yesterday = toDayString(new Date(now.getTime() - 86400000));
  const prev = user.streak || { current: 0, longest: 0, lastActiveDate: null };
  let current = prev.current ?? 0;
  let longest = prev.longest ?? 0;
  if (prev.lastActiveDate !== today) {
    current = prev.lastActiveDate === yesterday ? (prev.current || 0) + 1 : 1;
    longest = Math.max(prev.longest || 0, current);
    user.streak = { current, longest, lastActiveDate: today };
  }
  const existing = new Set((user.badges || []).map((b) => b.code));
  const newlyEarned = STREAK_BADGES.filter((b) => current >= b.thresholdDays && !existing.has(b.code));
  if (newlyEarned.length > 0) {
    user.badges = [
      ...(user.badges || []),
      ...newlyEarned.map((b) => ({ ...b, earnedAt: now })),
    ];
  }
  if (prev.lastActiveDate !== today || newlyEarned.length > 0) {
    await user.save();
  }
  return { current, longest, lastActiveDate: today, activeToday: true, newlyEarned };
}

async function getBadges(userId) {
  const user = await loadUser(userId);
  return {
    earned: user.badges || [],
    catalog: STREAK_BADGES,
  };
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
  getStreak,
  recordStudyActivity,
  getBadges,
  STREAK_BADGES,
  AVATAR_DIR,
};
