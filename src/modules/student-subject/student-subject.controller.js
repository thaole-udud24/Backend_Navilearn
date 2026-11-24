const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const service = require('./student-subject.service');

const createCtrl = asyncHandler(async (req, res) => {
  const item = await service.create(req.user.id, req.body);
  return created(res, item);
});

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listForOwner(req.user.id, req.query);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getOwned(req.params.id, req.user);
  return ok(res, item);
});

const updateCtrl = asyncHandler(async (req, res) => {
  const item = await service.update(req.params.id, req.user, req.body);
  return ok(res, item, 'Subject updated');
});

const removeCtrl = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user);
  return noContent(res);
});

module.exports = { createCtrl, listCtrl, getCtrl, updateCtrl, removeCtrl };
