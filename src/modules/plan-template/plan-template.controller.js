const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const service = require('./plan-template.service');

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listForRequester(req.user, req.query);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getById(req.params.id);
  return ok(res, item);
});

const createCtrl = asyncHandler(async (req, res) => {
  const item = await service.create(req.user.id, req.body);
  return created(res, item, 'Plan template created');
});

const updateCtrl = asyncHandler(async (req, res) => {
  const item = await service.update(req.params.id, req.user.id, req.body);
  return ok(res, item, 'Plan template updated');
});

const removeCtrl = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user.id);
  return noContent(res);
});

const publishCtrl = asyncHandler(async (req, res) => {
  const item = await service.publish(req.params.id, req.user.id, req.body.changeLog);
  return ok(res, item, 'Plan template published');
});

const archiveCtrl = asyncHandler(async (req, res) => {
  const item = await service.archive(req.params.id, req.user.id);
  return ok(res, item, 'Plan template archived');
});

const syncLessonCtrl = asyncHandler(async (req, res) => {
  const item = await service.syncStepFromLesson(req.params.id, req.params.stepIndex, req.user.id);
  return ok(res, item, 'Step synced from lesson');
});

const applyCtrl = asyncHandler(async (req, res) => {
  const plan = await service.apply(req.user.id, req.params.id, req.body.goalId);
  return created(res, plan, 'Plan proposed from template');
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
  listCtrl,
  getCtrl,
  createCtrl,
  updateCtrl,
  removeCtrl,
  publishCtrl,
  archiveCtrl,
  syncLessonCtrl,
  applyCtrl,
  importCtrl,
  exportCtrl,
};
