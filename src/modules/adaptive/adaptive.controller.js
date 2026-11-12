const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const service = require('./adaptive.service');

const nextBestActionCtrl = asyncHandler(async (req, res) => {
  const action = await service.nextBestAction(req.user.id);
  return ok(res, action, action ? 'OK' : 'No activity to recommend yet');
});

const startCtrl = asyncHandler(async (req, res) => {
  const result = await service.startNextBestAction(req.user.id);
  return created(res, result, 'Activity started');
});

const checkReplanCtrl = asyncHandler(async (req, res) => {
  const result = await service.checkReplan(req.user.id, req.params.planId);
  return ok(res, result);
});

const replanCtrl = asyncHandler(async (req, res) => {
  const result = await service.replan(req.user.id, req.body.planId);
  return created(res, result, 'Replan proposed');
});

module.exports = { nextBestActionCtrl, startCtrl, checkReplanCtrl, replanCtrl };