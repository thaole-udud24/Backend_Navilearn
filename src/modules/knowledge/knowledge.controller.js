const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const service = require('./knowledge.service');

const createCtrl = asyncHandler(async (req, res) => {
  const item = await service.create(req.user.id, req.body);
  return created(res, item);
});

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.query, req.user);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getById(req.params.id);
  return ok(res, item);
});

const updateCtrl = asyncHandler(async (req, res) => {
  const item = await service.update(req.params.id, req.user.id, req.body);
  return ok(res, item, 'Concept updated');
});

const updateStatusCtrl = asyncHandler(async (req, res) => {
  const item = await service.updateStatus(req.params.id, req.user.id, req.body.status);
  return ok(res, item, 'Status updated');
});

const removeCtrl = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  return noContent(res);
});

const importCtrl = asyncHandler(async (req, res) => {
  const report = await service.importBulk(req.user.id, req.body.items);
  return ok(res, report, 'Import finished');
});

const exportCtrl = asyncHandler(async (req, res) => {
  const items = await service.exportAll();
  return ok(res, items);
});

module.exports = {
  createCtrl,
  listCtrl,
  getCtrl,
  updateCtrl,
  updateStatusCtrl,
  removeCtrl,
  importCtrl,
  exportCtrl,
};
