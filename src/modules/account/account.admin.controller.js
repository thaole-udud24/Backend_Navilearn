const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const service = require('./account.admin.service');

const actorOf = (req) => ({ id: req.user.id, ip: req.ip });

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.query);
  return ok(res, items, 'OK', meta);
});

const exportCtrl = asyncHandler(async (req, res) => {
  const csv = await service.exportCsv(req.query, actorOf(req));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="users.csv"');
  return res.status(200).send(csv);
});

const getCtrl = asyncHandler(async (req, res) => ok(res, await service.getById(req.params.id)));

const createCtrl = asyncHandler(async (req, res) =>
  created(res, await service.create(actorOf(req), req.body), 'User created'),
);

const updateCtrl = asyncHandler(async (req, res) =>
  ok(res, await service.update(actorOf(req), req.params.id, req.body), 'User updated'),
);

const lockCtrl = asyncHandler(async (req, res) =>
  ok(res, await service.lock(actorOf(req), req.params.id, req.body), 'User locked'),
);

const unlockCtrl = asyncHandler(async (req, res) =>
  ok(res, await service.unlock(actorOf(req), req.params.id), 'User unlocked'),
);

const removeCtrl = asyncHandler(async (req, res) => {
  await service.remove(actorOf(req), req.params.id);
  return noContent(res);
});

const loginLogsCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.loginLogs(req.params.id, req.query);
  return ok(res, items, 'OK', meta);
});

const sendResetCtrl = asyncHandler(async (req, res) =>
  ok(res, await service.sendResetLink(actorOf(req), req.params.id), 'Reset link sent'),
);

const auditLogsCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.auditLogs(req.query);
  return ok(res, items, 'OK', meta);
});

module.exports = {
  listCtrl,
  exportCtrl,
  getCtrl,
  createCtrl,
  updateCtrl,
  lockCtrl,
  unlockCtrl,
  removeCtrl,
  loginLogsCtrl,
  sendResetCtrl,
  auditLogsCtrl,
};
