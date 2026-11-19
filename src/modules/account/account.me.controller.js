const asyncHandler = require('../../utils/asyncHandler');
const { ok, noContent } = require('../../utils/response');
const service = require('./account.me.service');

const getProfileCtrl = asyncHandler(async (req, res) => ok(res, await service.getProfile(req.user.id)));

const updateProfileCtrl = asyncHandler(async (req, res) =>
  ok(res, await service.updateProfile(req.user.id, req.body), 'Profile updated'),
);

const avatarCtrl = asyncHandler(async (req, res) => ok(res, await service.setAvatar(req.user.id, req.file), 'Avatar updated'));

const changePasswordCtrl = asyncHandler(async (req, res) =>
  ok(res, await service.changePassword(req.user.id, req.user.sid, req.body), 'Password changed'),
);

const listSessionsCtrl = asyncHandler(async (req, res) => ok(res, await service.listSessions(req.user.id, req.user.sid)));

const revokeSessionCtrl = asyncHandler(async (req, res) => {
  await service.revokeSession(req.user.id, req.params.id);
  return noContent(res);
});

const revokeOtherSessionsCtrl = asyncHandler(async (req, res) =>
  ok(res, await service.revokeOtherSessions(req.user.id, req.user.sid), 'Other sessions signed out'),
);

const deleteAccountCtrl = asyncHandler(async (req, res) => {
  await service.deleteAccount(req.user.id, req.body);
  return noContent(res);
});

module.exports = {
  getProfileCtrl,
  updateProfileCtrl,
  avatarCtrl,
  changePasswordCtrl,
  listSessionsCtrl,
  revokeSessionCtrl,
  revokeOtherSessionsCtrl,
  deleteAccountCtrl,
};
