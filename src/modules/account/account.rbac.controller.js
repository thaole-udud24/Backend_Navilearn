const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const service = require('./account.rbac.service');

const rolesCtrl = asyncHandler(async (req, res) => ok(res, await service.listRoles()));
const matrixCtrl = asyncHandler(async (req, res) => ok(res, service.matrix(req.query)));
const effectiveCtrl = asyncHandler(async (req, res) => ok(res, await service.effective(req.params.userId)));
const deniedLogsCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.deniedLogs(req.query);
  return ok(res, items, 'OK', meta);
});
const exportCtrl = asyncHandler(async (req, res) => {
  const csv = await service.exportMatrix(req.query, { ...req.user, ip: req.ip });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="rbac-permission-matrix.csv"');
  return res.status(200).send(csv);
});

module.exports = { rolesCtrl, matrixCtrl, effectiveCtrl, deniedLogsCtrl, exportCtrl };
