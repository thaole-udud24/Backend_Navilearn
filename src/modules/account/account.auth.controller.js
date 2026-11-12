const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const authService = require('./account.auth.service');

const registerCtrl = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return created(res, result, 'Account registered');
});

const loginCtrl = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return ok(res, result, 'Logged in');
});

const refreshCtrl = asyncHandler(async (req, res) => {
  const result = await authService.refresh(req.body);
  return ok(res, result, 'Token refreshed');
});

const meCtrl = asyncHandler(async (req, res) => {
  const result = await authService.me(req.user.id);
  return ok(res, result, 'OK');
});

module.exports = { registerCtrl, loginCtrl, refreshCtrl, meCtrl };
