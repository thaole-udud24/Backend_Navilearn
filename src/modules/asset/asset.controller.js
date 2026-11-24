const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const service = require('./asset.service');

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.query);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getById(req.params.id);
  return ok(res, item);
});

const createCtrl = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Thiếu tệp tải lên', 'FILE_REQUIRED');
  const item = await service.create(req.user.id, req.body, req.file);
  return created(res, item, 'Asset uploaded');
});

const removeCtrl = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user.id);
  return noContent(res);
});

module.exports = { listCtrl, getCtrl, createCtrl, removeCtrl };
