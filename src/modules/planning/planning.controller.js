const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const service = require('./planning.service');

const createCtrl = asyncHandler(async (req, res) => {
  const item = await service.create(req.user.id, req.body);
  return created(res, item);
});

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listForOwner(req.user.id, req.query);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getOwned(req.params.id, req.user);
  return ok(res, item);
});

const confirmCtrl = asyncHandler(async (req, res) => {
  const item = await service.confirm(req.params.id, req.user);
  return ok(res, item, 'Plan confirmed');
});

const removeCtrl = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user);
  return noContent(res);
});

const addSessionCtrl = asyncHandler(async (req, res) => {
  const item = await service.addSession(req.params.id, req.user, req.body);
  return created(res, item);
});

const updateSessionCtrl = asyncHandler(async (req, res) => {
  const item = await service.updateSession(req.params.id, req.params.sessionId, req.user, req.body);
  return ok(res, item, 'Session updated');
});

const removeSessionCtrl = asyncHandler(async (req, res) => {
  await service.removeSession(req.params.id, req.params.sessionId, req.user);
  return noContent(res);
});

const createGoalCtrl = asyncHandler(async (req, res) => {
  const goal = await service.createGoal(req.user.id, req.body);
  return created(res, goal);
});

const listGoalsCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listGoals(req.user.id, req.query);
  return ok(res, items, 'OK', meta);
});

const getGoalCtrl = asyncHandler(async (req, res) => {
  const goal = await service.getOwnedGoal(req.params.id, req.user);
  return ok(res, goal);
});

const updateGoalCtrl = asyncHandler(async (req, res) => {
  const goal = await service.updateGoal(req.params.id, req.user, req.body);
  return ok(res, goal, 'Goal updated');
});

const removeGoalCtrl = asyncHandler(async (req, res) => {
  await service.removeGoal(req.params.id, req.user);
  return noContent(res);
});

module.exports = {
  createCtrl,
  listCtrl,
  getCtrl,
  confirmCtrl,
  addSessionCtrl,
  updateSessionCtrl,
  removeSessionCtrl,
  removeCtrl,
  createGoalCtrl,
  listGoalsCtrl,
  getGoalCtrl,
  updateGoalCtrl,
  removeGoalCtrl,
};