const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const service = require('./question-bank.service');

const createCtrl = asyncHandler(async (req, res) => {
  const item = await service.create(req.user.id, req.body);
  return created(res, item);
});

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.query, req.user);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getById(req.params.id, req.user);
  return ok(res, item);
});

const updateCtrl = asyncHandler(async (req, res) => {
  const item = await service.update(req.params.id, req.user.id, req.body);
  return ok(res, item, 'Question updated');
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

const importCtrl = asyncHandler(async (req, res) => {
  const report = await service.importBulk(req.user.id, req.body.items);
  return ok(res, report, 'Import finished');
});

const exportCtrl = asyncHandler(async (req, res) => {
  const items = await service.exportAll(req.query, req.user);
  return ok(res, items);
});

const fromAiDraftCtrl = asyncHandler(async (req, res) => {
  const item = await service.approveFromAiDraft(req.user.id, req.body);
  return created(res, item, 'AI draft approved into question bank');
});

const reportIssueCtrl = asyncHandler(async (req, res) => {
  const report = await service.reportIssue(req.user.id, req.params.id, req.body);
  return created(res, report, 'Issue reported');
});

const listIssueReportsCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listIssueReports(req.query);
  return ok(res, items, 'OK', meta);
});

const resolveIssueReportCtrl = asyncHandler(async (req, res) => {
  const report = await service.resolveIssueReport(req.params.id, req.user.id, req.body);
  return ok(res, report, 'Issue report resolved');
});

const qualityStatsCtrl = asyncHandler(async (req, res) => {
  const stats = await service.qualityStats(req.query);
  return ok(res, stats);
});

const duplicatesCtrl = asyncHandler(async (req, res) => {
  const groups = await service.findDuplicates(req.query);
  return ok(res, groups);
});

const regradeImpactCtrl = asyncHandler(async (req, res) => {
  const impact = await service.previewRegradeImpact(req.params.id);
  return ok(res, impact);
});

const confirmRegradeCtrl = asyncHandler(async (req, res) => {
  const result = await service.confirmRegrade(req.params.id, req.user.id);
  return ok(res, result, 'Regrade applied');
});

module.exports = {
  createCtrl,
  listCtrl,
  getCtrl,
  updateCtrl,
  duplicateCtrl,
  updateStatusCtrl,
  removeCtrl,
  importCtrl,
  exportCtrl,
  fromAiDraftCtrl,
  reportIssueCtrl,
  listIssueReportsCtrl,
  resolveIssueReportCtrl,
  qualityStatsCtrl,
  duplicatesCtrl,
  regradeImpactCtrl,
  confirmRegradeCtrl,
};
