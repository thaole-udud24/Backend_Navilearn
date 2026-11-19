const bcrypt = require('bcryptjs');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const User = require('./account.auth.model');
const LoginLog = require('./account.loginlog.model');
const { toPublicUser } = require('./account.public');
const { assertPassword } = require('./account.password.policy');
const sessions = require('./account.session.service');
const tokens = require('./account.token.service');

const { TOKEN_TYPES } = tokens;
const GENERIC_LOGIN_ERROR = 'Invalid email or password';

const logAttempt = (user, email, success, reason, ctx) =>
  LoginLog.create({
    user: user ? user.id : null,
    email,
    success,
    reason,
    ip: ctx.ip || '',
    userAgent: String(ctx.userAgent || '').slice(0, 300),
  });

const lockMinutesLeft = (user) => Math.max(1, Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000));

/** Creates the session + tokens for a user that has just proven who they are. */
async function issueLogin(user, ctx) {
  user.failedAttempts = 0;
  user.lockUntil = null;
  user.lastLoginAt = new Date();
  await user.save();
  const { accessToken, refreshToken } = await sessions.createSession(user, ctx);
  await logAttempt(user, user.email, true, 'ok', ctx);
  return { user: toPublicUser(user), accessToken, refreshToken };
}

/** BIZ-ACC-06 step 1: creates an unverified STUDENT account and mails an OTP. No tokens until the email is verified. */
async function register({ email, password, fullName }) {
  assertPassword(password, { email, fullName });

  let user = await User.findOne({ email });
  if (user && user.emailVerified) throw ApiError.conflict('Email already registered', 'EMAIL_EXISTS');

  const passwordHash = await bcrypt.hash(password, 10);
  if (user) {
    // Registered earlier but never verified: let the owner start over with the newly typed data.
    user.passwordHash = passwordHash;
    user.fullName = fullName;
    await user.save();
  } else {
    user = await User.create({ email, passwordHash, fullName });
  }

  try {
    const otp = await tokens.issueOtp(user, TOKEN_TYPES.VERIFY_EMAIL);
    await tokens.sendOtpMail(user, TOKEN_TYPES.VERIFY_EMAIL, otp);
  } catch (err) {
    // Cooldown hit (re-register within seconds): the previous code is still valid, so just carry on.
    if (!(err instanceof ApiError && err.code === 'OTP_COOLDOWN')) throw err;
  }
  return { email: user.email, requiresVerification: true };
}

/** BIZ-ACC-06 step 2: verifies the OTP, activates the account and logs the user in. */
async function verifyEmail({ email, otp }, ctx) {
  const user = await User.findOne({ email });
  await tokens.consumeOtp(user, TOKEN_TYPES.VERIFY_EMAIL, otp);
  user.emailVerified = true;
  return issueLogin(user, ctx);
}

/** Re-sends an OTP. Always answers the same way so it cannot be used to discover which emails exist. */
async function resendOtp({ email, purpose }) {
  const user = await User.findOne({ email });
  const type = purpose === 'reset' ? TOKEN_TYPES.RESET_OTP : TOKEN_TYPES.VERIFY_EMAIL;
  const eligible = user && user.isActive && (purpose === 'reset' ? true : !user.emailVerified);
  if (eligible) {
    const otp = await tokens.issueOtp(user, type); // may throw OTP_COOLDOWN (429): the caller knows the email by now
    await tokens.sendOtpMail(user, type, otp);
  }
  return { sent: true };
}

/** BIZ-ACC-13 / BR-46: email + password login with temporary lock after repeated failures. */
async function login({ email, password }, ctx) {
  const user = await User.findOne({ email });
  if (!user) {
    await logAttempt(null, email, false, 'unknown_email', ctx);
    throw ApiError.unauthorized(GENERIC_LOGIN_ERROR);
  }

  if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
    await logAttempt(user, email, false, 'temp_locked', ctx);
    throw new ApiError(423, `Tài khoản tạm khóa, thử lại sau ${lockMinutesLeft(user)} phút`, 'ACCOUNT_TEMP_LOCKED');
  }

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) {
    // A lock that already expired starts counting from zero again.
    if (user.lockUntil) {
      user.lockUntil = null;
      user.failedAttempts = 0;
    }
    user.failedAttempts += 1;
    const nowLocked = user.failedAttempts >= env.LOGIN_MAX_ATTEMPTS;
    if (nowLocked) {
      user.lockUntil = new Date(Date.now() + env.LOGIN_LOCK_MINUTES * 60 * 1000);
      user.failedAttempts = 0;
    }
    await user.save();
    await logAttempt(user, email, false, nowLocked ? 'wrong_password_locked' : 'wrong_password', ctx);
    if (nowLocked) {
      throw new ApiError(423, `Nhập sai quá ${env.LOGIN_MAX_ATTEMPTS} lần, tài khoản tạm khóa ${env.LOGIN_LOCK_MINUTES} phút`, 'ACCOUNT_TEMP_LOCKED');
    }
    throw ApiError.unauthorized(GENERIC_LOGIN_ERROR);
  }

  if (!user.isActive) {
    await logAttempt(user, email, false, 'account_locked', ctx);
    throw ApiError.forbidden('Tài khoản đã bị khóa, vui lòng liên hệ quản trị viên');
  }
  if (!user.emailVerified) {
    await logAttempt(user, email, false, 'email_not_verified', ctx);
    throw new ApiError(403, 'Email chưa được xác minh', 'EMAIL_NOT_VERIFIED');
  }

  return issueLogin(user, ctx);
}

async function refresh({ refreshToken }) {
  return sessions.rotateSession(refreshToken, (id) => User.findById(id));
}

async function logout({ refreshToken }) {
  await sessions.endSessionByRefreshToken(refreshToken);
  return { loggedOut: true };
}

/** BIZ-ACC-09: starts the "forgot password" flow. Same answer whether or not the email exists. */
async function forgotPassword({ email }) {
  const user = await User.findOne({ email });
  if (user && user.isActive) {
    try {
      const otp = await tokens.issueOtp(user, TOKEN_TYPES.RESET_OTP);
      await tokens.sendOtpMail(user, TOKEN_TYPES.RESET_OTP, otp);
    } catch (err) {
      if (!(err instanceof ApiError && err.code === 'OTP_COOLDOWN')) throw err;
    }
  }
  return { sent: true };
}

/** Exchanges a correct reset OTP for a one-time reset token. */
async function verifyResetOtp({ email, otp }) {
  const user = await User.findOne({ email });
  await tokens.consumeOtp(user, TOKEN_TYPES.RESET_OTP, otp);
  const resetToken = await tokens.issueResetTicket(user);
  return { resetToken };
}

/** Sets a new password with a reset token (from OTP verification or from an admin-sent link). BR-49 applies. */
async function resetPassword({ resetToken, password }) {
  const userId = await tokens.consumeResetTicket(resetToken);
  const user = await User.findById(userId);
  if (!user) throw ApiError.badRequest('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn', 'RESET_TOKEN_INVALID');
  assertPassword(password, { email: user.email, fullName: user.fullName });

  user.passwordHash = await bcrypt.hash(password, 10);
  user.failedAttempts = 0;
  user.lockUntil = null;
  // Resetting through an emailed code/link proves the mailbox belongs to the owner.
  user.emailVerified = true;
  await user.save();
  await sessions.revokeAllSessions(user.id);
  return { reset: true };
}

async function me(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return toPublicUser(user);
}

module.exports = {
  register,
  verifyEmail,
  resendOtp,
  login,
  refresh,
  logout,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  me,
};
