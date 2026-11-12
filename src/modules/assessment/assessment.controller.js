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
  const item = await service.getOwned(req.params.id, req.user);
  return ok(res, item);
});

const getWrongAnswersCtrl = asyncHandler(async (req, res) => {
  const result = await service.getWrongAnswers(req.params.id, req.user);
  return ok(res, result);
});

const getScoreHistoryCtrl = asyncHandler(async (req, res) => {
  const history = await service.getScoreHistory(req.params.id, req.user);
  return ok(res, history);
});

const compareCtrl = asyncHandler(async (req, res) => {
  const result = await service.compareAttempts(req.user.id, req.query.concept);
  return ok(res, result);
});

const setFlagCtrl = asyncHandler(async (req, res) => {
  const item = await service.setFlag(req.params.id, req.user.id, req.body.question, req.body.flagged);
  return ok(res, item, 'Flag updated');
});

const saveDraftCtrl = asyncHandler(async (req, res) => {
  const item = await service.saveDraft(req.params.id, req.user.id, req.body.answers);
  return ok(res, item, 'Draft saved');
});

const submitCtrl = asyncHandler(async (req, res) => {
  const item = await service.submit(req.params.id, req.user.id, req.body.answers);
  return ok(res, item, 'Assessment graded');
});

const retryWrongCtrl = asyncHandler(async (req, res) => {
  const item = await service.startRetryWrong(req.user.id, req.body.previousAttemptId);
  return created(res, item);
});

const independentCheckCtrl = asyncHandler(async (req, res) => {
  const item = await service.startIndependentCheck(req.user.id, req.body.concept);
  return created(res, item);
});

module.exports = {
  startCtrl,
  listCtrl,
  getCtrl,
  getWrongAnswersCtrl,
  getScoreHistoryCtrl,
  compareCtrl,
  setFlagCtrl,
  saveDraftCtrl,
  submitCtrl,
  retryWrongCtrl,
  independentCheckCtrl,
};
