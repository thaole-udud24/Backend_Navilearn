const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const service = require('./mastery.service');

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listForOwner(req.user.id, req.query);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getOwned(req.params.id, req.user);
  return ok(res, item);
});

const getTrendCtrl = asyncHandler(async (req, res) => {
  const trend = await service.getTrend(req.params.id, req.user, req.query);
  return ok(res, trend);
});

const setGoalCtrl = asyncHandler(async (req, res) => {
  const item = await service.setGoal(req.params.id, req.user, req.body.goalScore);
  return ok(res, item, 'Goal updated');
});

const markContentCompleteCtrl = asyncHandler(async (req, res) => {
  const item = await service.markContentComplete(req.user.id, req.body.concept, req.body.contentRef);
  return created(res, item, 'Progress updated');
});

const exportReportCtrl = asyncHandler(async (req, res) => {
  const report = await service.exportReport(req.user.id, req.query);
  return ok(res, report);
});

module.exports = { listCtrl, getCtrl, getTrendCtrl, setGoalCtrl, markContentCompleteCtrl, exportReportCtrl };
