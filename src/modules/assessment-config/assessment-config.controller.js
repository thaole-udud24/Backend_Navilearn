const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const service = require('./assessment-config.service');

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
  return ok(res, item, 'Assessment config updated');
});

const updatePolicyCtrl = asyncHandler(async (req, res) => {
  const item = await service.updatePolicy(req.params.id, req.user.id, req.body);
  return ok(res, item, 'Policy updated');
});

const duplicateCtrl = asyncHandler(async (req, res) => {
  const item = await service.duplicate(req.params.id, req.user.id);
  return created(res, item);
});

const updateStatusCtrl = asyncHandler(async (req, res) => {
  const item = await service.updateStatus(req.params.id, req.user.id, req.body.status);
  return ok(res, item, 'Status updated');
});

const removeCtrl = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  return noContent(res);
});

const createRubricCtrl = asyncHandler(async (req, res) => {
  const item = await service.createRubric(req.user.id, req.body);
  return created(res, item);
});

const listRubricsCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listRubrics(req.query, req.user);
  return ok(res, items, 'OK', meta);
});

const getRubricCtrl = asyncHandler(async (req, res) => {
  const item = await service.getRubric(req.params.id);
  return ok(res, item);
});

const updateRubricCtrl = asyncHandler(async (req, res) => {
  const item = await service.updateRubric(req.params.id, req.user.id, req.body);
  return ok(res, item, 'Rubric updated');
});

const updateRubricStatusCtrl = asyncHandler(async (req, res) => {
  const item = await service.updateRubricStatus(req.params.id, req.user.id, req.body.status);
  return ok(res, item, 'Rubric status updated');
});

module.exports = {
  createCtrl,
  listCtrl,
  getCtrl,
  updateCtrl,
  updatePolicyCtrl,
  duplicateCtrl,
  updateStatusCtrl,
  removeCtrl,
  createRubricCtrl,
  listRubricsCtrl,
  getRubricCtrl,
  updateRubricCtrl,
  updateRubricStatusCtrl,
};
