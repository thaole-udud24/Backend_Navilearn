const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const service = require('./risk.service');

const listWarningsCtrl = asyncHandler(async (req, res) => {
  const warnings = await service.listWarnings(req.user.id);
  return ok(res, warnings);
});

const dismissCtrl = asyncHandler(async (req, res) => {
  const { key, action } = req.body;
  const dismissal = await service.dismiss(req.user.id, key, action);
  return ok(res, dismissal, 'OK');
});

module.exports = { listWarningsCtrl, dismissCtrl };
