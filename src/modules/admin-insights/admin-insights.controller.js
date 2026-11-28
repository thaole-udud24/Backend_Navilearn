const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const service = require('./admin-insights.service');

const subjectsCtrl = asyncHandler(async (req, res) => {
  const subjects = await service.listSubjects();
  return ok(res, subjects);
});

const learningEffectivenessCtrl = asyncHandler(async (req, res) => {
  const report = await service.learningEffectivenessReport(req.query);
  return ok(res, report);
});

const volumeCtrl = asyncHandler(async (req, res) => {
  const report = await service.volumeReport({ days: req.query.days ? Number(req.query.days) : undefined });
  return ok(res, report);
});

const topMissedCtrl = asyncHandler(async (req, res) => {
  const rows = await service.topMissedQuestions({
    limit: req.query.limit ? Number(req.query.limit) : undefined,
    concept: req.query.concept,
  });
  return ok(res, rows);
});

const exportCtrl = asyncHandler(async (req, res) => {
  const { report, ...params } = req.query;
  const csv = await service.exportReportCsv(report, {
    subjectId: params.subjectId,
    days: params.days ? Number(params.days) : undefined,
    limit: params.limit ? Number(params.limit) : undefined,
    concept: params.concept,
  });
  res.setHeader('Content-Type', 'text/csv; charset=UTF-8');
  res.setHeader('Content-Disposition', `attachment; filename="bao_cao_${report}.csv"`);
  return res.status(200).send(csv);
});

module.exports = {
  subjectsCtrl,
  learningEffectivenessCtrl,
  volumeCtrl,
  topMissedCtrl,
  exportCtrl,
};
