const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const service = require('./account.rbac.service');

const rolesCtrl = asyncHandler(async (req, res) => {
  const roles = await service.getRoleCatalog();
  return ok(res, roles);
});

const matrixCtrl = asyncHandler(async (req, res) => {
  const matrix = service.getPermissionMatrix(req.query.role);
  return ok(res, matrix);
});

const effectiveCtrl = asyncHandler(async (req, res) => {
  const result = await service.getEffectivePermissions(req.params.accountId);
  return ok(res, result);
});

const exportCtrl = asyncHandler(async (req, res) => {
  const csv = await service.exportPermissionMatrix(req.query.role, req.user.id);
  res.setHeader('Content-Type', 'text/csv; charset=UTF-8');
  res.setHeader('Content-Disposition', 'attachment; filename="permission_matrix.csv"');
  return res.status(200).send(csv);
});

const deniedLogCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.getDeniedAccessLog(req.query);
  return ok(res, items, 'OK', meta);
});

module.exports = { rolesCtrl, matrixCtrl, effectiveCtrl, exportCtrl, deniedLogCtrl };
