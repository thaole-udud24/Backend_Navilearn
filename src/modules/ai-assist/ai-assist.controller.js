const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const service = require('./ai-assist.service');

const generateQuestionCtrl = asyncHandler(async (req, res) => {
  const draft = await service.generateQuestion(req.user.id, req.body);
  return ok(res, draft, 'Draft question generated');
});

const practiceQuestionCtrl = asyncHandler(async (req, res) => {
  const draft = await service.practiceQuestion(req.user.id, req.body);
  return ok(res, draft, 'Practice question generated');
});

const askCtrl = asyncHandler(async (req, res) => {
  const result = await service.askWithSource(req.user.id, req.body);
  return ok(res, result);
});

const explainWrongCtrl = asyncHandler(async (req, res) => {
  const result = await service.explainWrong(req.user.id, req.body);
  return ok(res, result);
});

const essayFeedbackCtrl = asyncHandler(async (req, res) => {
  const result = await service.essayFeedback(req.user.id, req.body);
  return ok(res, result);
});

const generatePlanCtrl = asyncHandler(async (req, res) => {
  const result = await service.generateStudyPlan(req.user.id, req.body.goalId);
  return created(res, result, 'Study plan proposed');
});

const generateConceptCtrl = asyncHandler(async (req, res) => {
  const draft = await service.generateConceptDraft(req.user.id, req.body);
  return ok(res, draft, 'Concept draft generated');
});

const generateTemplateCtrl = asyncHandler(async (req, res) => {
  const draft = await service.generateTemplateDraft(req.user.id, req.body);
  return ok(res, draft, 'Plan template draft generated');
});

const adminOverviewCtrl = asyncHandler(async (req, res) => {
  const overview = await service.adminOverview();
  return ok(res, overview);
});

// A5 "Review Workspace".
const listQuestionDraftsCtrl = asyncHandler(async (req, res) => {
  const drafts = await service.listQuestionDrafts(req.query);
  return ok(res, drafts);
});

const rejectQuestionDraftCtrl = asyncHandler(async (req, res) => {
  await service.rejectQuestionDraft(req.params.id, req.user.id);
  return noContent(res);
});

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.user.id, req.query, req.user);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getOwned(req.params.id, req.user.id);
  return ok(res, item);
});

const removeCtrl = asyncHandler(async (req, res) => {
  await service.removeOwned(req.params.id, req.user.id);
  return noContent(res);
});

const rateCtrl = asyncHandler(async (req, res) => {
  const item = await service.rate(req.params.id, req.user.id, req.body);
  return ok(res, item, 'Rating saved');
});

const reportCtrl = asyncHandler(async (req, res) => {
  const item = await service.report(req.params.id, req.user.id, req.body);
  return created(res, item, 'Report submitted');
});

module.exports = {
  adminOverviewCtrl,
  listQuestionDraftsCtrl,
  rejectQuestionDraftCtrl,
  generateQuestionCtrl,
  practiceQuestionCtrl,
  askCtrl,
  explainWrongCtrl,
  essayFeedbackCtrl,
  generatePlanCtrl,
  generateConceptCtrl,
  generateTemplateCtrl,
  listCtrl,
  getCtrl,
  removeCtrl,
  rateCtrl,
  reportCtrl,
};
