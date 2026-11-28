const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const service = require('./mastery.service');
const dashboardService = require('./mastery.dashboard.service');

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listForOwner(req.user.id, req.query, req.user);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getOwned(req.params.id, req.user);
  const payload = { ...item.toObject(), learningState: service.computeDisplayState(item) };
  return ok(res, payload);
});

const openContentCtrl = asyncHandler(async (req, res) => {
  const item = await service.openContent(req.user.id, req.body.concept);
  return created(res, item, 'Content opened');
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

const dashboardCtrl = asyncHandler(async (req, res) => {
  const dashboard = await dashboardService.getDashboard(req.user.id); 
  return ok(res, dashboard);
});

module.exports = {
  listCtrl,
  getCtrl,
  getTrendCtrl,
  setGoalCtrl,
  markContentCompleteCtrl,
  exportReportCtrl,
  openContentCtrl,
  dashboardCtrl,
};
