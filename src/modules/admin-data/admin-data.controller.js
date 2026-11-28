const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const service = require('./admin-data.service');

const retentionStatsCtrl = asyncHandler(async (req, res) => {
  const stats = await service.retentionStats();
  return ok(res, stats);
});

const staleRecordsCtrl = asyncHandler(async (req, res) => {
  const data = await service.staleRecords({ days: req.query.days ? Number(req.query.days) : undefined });
  return ok(res, data);
});

const exportStudentCtrl = asyncHandler(async (req, res) => {
  const data = await service.exportStudentData(req.query.student);
  return ok(res, data);
});

const activityLogCtrl = asyncHandler(async (req, res) => {
  const logs = await service.recentDataActivity({ limit: req.query.limit ? Number(req.query.limit) : undefined });
  return ok(res, logs);
});

module.exports = { retentionStatsCtrl, staleRecordsCtrl, exportStudentCtrl, activityLogCtrl };
