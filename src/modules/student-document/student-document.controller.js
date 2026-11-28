const ApiError = require('../../utils/ApiError');
const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const service = require('./student-document.service');

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.user.id, req.query, req.user);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getOwned(req.params.id, req.user.id);
  return ok(res, item);
});

const createCtrl = asyncHandler(async (req, res) => {
  if (!req.file) throw ApiError.badRequest('Thiếu tệp tải lên', 'FILE_REQUIRED');
  const item = await service.create(req.user.id, req.body, req.file);
  return created(res, item, 'Đã tải lên tài liệu');
});

const updateCtrl = asyncHandler(async (req, res) => {
  const item = await service.update(req.params.id, req.user.id, req.body);
  return ok(res, item, 'Đã cập nhật tài liệu');
});

const removeCtrl = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user.id);
  return noContent(res);
});

const analyzeCtrl = asyncHandler(async (req, res) => {
  const item = await service.analyzeDocument(req.params.id, req.user.id);
  return ok(res, item, 'Đã phân tích tài liệu');
});

module.exports = { listCtrl, getCtrl, createCtrl, updateCtrl, removeCtrl, analyzeCtrl };
