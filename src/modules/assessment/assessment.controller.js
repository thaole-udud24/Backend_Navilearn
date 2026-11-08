const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const service = require('./assessment.service');

const startCtrl = asyncHandler(async (req, res) => {
  const item = await service.start(req.user.id, req.body.assessmentConfig);
  return created(res, item);
});

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listForOwner(req.user.id, req.query);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getOwned(req.params.id, req.user.id);
  return ok(res, item);
});

const submitCtrl = asyncHandler(async (req, res) => {
  const item = await service.submit(req.params.id, req.user.id, req.body.answers);
  return ok(res, item, 'Assessment graded');
});

module.exports = { startCtrl, listCtrl, getCtrl, submitCtrl };
