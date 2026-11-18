const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const authService = require('./account.auth.service');

// Where the request came from, kept with the session and the login history.
const clientContext = (req) => ({ ip: req.ip, userAgent: req.headers['user-agent'] || '' });

const registerCtrl = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return created(res, result, 'Account registered, please verify your email');
});

const verifyEmailCtrl = asyncHandler(async (req, res) => {
  const result = await authService.verifyEmail(req.body, clientContext(req));
  return ok(res, result, 'Email verified');
});

const resendOtpCtrl = asyncHandler(async (req, res) => {
  const result = await authService.resendOtp(req.body);
  return ok(res, result, 'If the account exists, a new code has been sent');
});

const loginCtrl = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body, clientContext(req));
  return ok(res, result, 'Logged in');
});

const refreshCtrl = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body);
  return ok(res, result, 'Token refreshed');
});

const logoutCtrl = asyncHandler(async (req, res) => {
  const result = await authService.logout(req.body);
  return ok(res, result, 'Logged out');
});

const forgotPasswordCtrl = asyncHandler(async (req, res) => {
  const result = await authService.forgotPassword(req.body);
  return ok(res, result, 'If the account exists, a reset code has been sent');
});

const verifyResetOtpCtrl = asyncHandler(async (req, res) => {
  const result = await authService.verifyResetOtp(req.body);
  return ok(res, result, 'Code verified');
});

const resetPasswordCtrl = asyncHandler(async (req, res) => {
  const result = await authService.resetPassword(req.body);
  return ok(res, result, 'Password updated');
});

const meCtrl = asyncHandler(async (req, res) => {
  const result = await authService.me(req.user.id);
  return ok(res, result, 'OK');
});

module.exports = {
  registerCtrl,
  verifyEmailCtrl,
  resendOtpCtrl,
  loginCtrl,
  refreshCtrl,
  logoutCtrl,
  forgotPasswordCtrl,
  verifyResetOtpCtrl,
  resetPasswordCtrl,
  meCtrl,
};
