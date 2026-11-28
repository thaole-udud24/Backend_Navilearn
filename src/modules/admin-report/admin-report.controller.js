const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const service = require('./admin-report.service');
const { ROLES } = require('../../shared/roles');

const createCtrl = asyncHandler(async (req, res) => {
  const item = await service.create(req.user.id, req.body, req.file);
  return created(res, item);
});

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } =
    req.user.role === ROLES.ADMIN
      ? await service.listAll(req.query)
      : await service.listForOwner(req.user.id, req.query);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getOwned(req.params.id, req.user);
  return ok(res, item);
});

const updateStatusCtrl = asyncHandler(async (req, res) => {
  const item = await service.updateStatus(req.params.id, req.user.id, req.body.status);
  return ok(res, item, 'Status updated');
});

const removeCtrl = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user);
  return noContent(res);
});

// B10: admin reply.
const respondCtrl = asyncHandler(async (req, res) => {
  const item = await service.respond(req.params.id, req.user.id, req.body.message);
  return ok(res, item, 'Reply sent');
});

module.exports = { createCtrl, listCtrl, getCtrl, updateStatusCtrl, removeCtrl, respondCtrl };
