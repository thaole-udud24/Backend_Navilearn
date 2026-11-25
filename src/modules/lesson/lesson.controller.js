const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const service = require('./lesson.service');

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.query);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getById(req.params.id);
  return ok(res, item);
});

const createCtrl = asyncHandler(async (req, res) => {
  const item = await service.create(req.user.id, req.body);
  return created(res, item, 'Lesson created');
});

const updateCtrl = asyncHandler(async (req, res) => {
  const item = await service.update(req.params.id, req.user.id, req.body);
  return ok(res, item, 'Lesson updated');
});

const removeCtrl = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user.id);
  return noContent(res);
});

const publishCtrl = asyncHandler(async (req, res) => {
  const item = await service.publish(req.params.id, req.user.id);
  return ok(res, item, 'Lesson published');
});

const archiveCtrl = asyncHandler(async (req, res) => {
  const item = await service.archive(req.params.id, req.user.id);
  return ok(res, item, 'Lesson archived');
});

module.exports = { listCtrl, getCtrl, createCtrl, updateCtrl, removeCtrl, publishCtrl, archiveCtrl };
