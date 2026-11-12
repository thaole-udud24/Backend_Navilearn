const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const service = require('./mastery.service');

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listForOwner(req.user.id, req.query);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getOwned(req.params.id, req.user);
  return ok(res, item);
});

module.exports = { listCtrl, getCtrl };
