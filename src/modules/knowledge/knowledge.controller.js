const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const { record } = require('../../shared/audit-log');
const service = require('./knowledge.service');
const templates = require('./knowledge.template.service');

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
  await record({
    actorId: req.user.id,
    action: 'knowledge.import',
    targetType: 'Concept',
    meta: { createdCount: report.createdCount, errorCount: report.errorCount },
  });
  return ok(res, report, 'Import finished');
});

const exportCtrl = asyncHandler(async (req, res) => {
  const items = await service.exportAll();
  await record({ actorId: req.user.id, action: 'knowledge.export', targetType: 'Concept', meta: { count: items.length } });
  return ok(res, items);
});

const subjectGraphCtrl = asyncHandler(async (req, res) => {
  const items = await service.getSubjectGraph(req.params.id);
  return ok(res, items);
});

// ---- admin: sample structures ----
const validateStructureCtrl = asyncHandler(async (req, res) =>
  ok(res, await templates.validateStructure(req.params.id)),
);
const copyStructureCtrl = asyncHandler(async (req, res) =>
  created(res, await templates.copyStructure(req.user.id, req.params.id, req.body), 'Đã sao chép cấu trúc mẫu'),
);
const deactivateStructureCtrl = asyncHandler(async (req, res) =>
  ok(res, await templates.setStructureStatus(req.user.id, req.params.id, 'archived'), 'Đã ngừng sử dụng cấu trúc mẫu'),
);
const restoreStructureCtrl = asyncHandler(async (req, res) =>
  ok(res, await templates.setStructureStatus(req.user.id, req.params.id, 'active'), 'Đã khôi phục cấu trúc mẫu'),
);

module.exports = {
  validateStructureCtrl,
  copyStructureCtrl,
  deactivateStructureCtrl,
  restoreStructureCtrl,
  createCtrl,
  listCtrl,
  getCtrl,
  updateCtrl,
  updateStatusCtrl,
  removeCtrl,
  importCtrl,
  exportCtrl,
  subjectGraphCtrl,
};
