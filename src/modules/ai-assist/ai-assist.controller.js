const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const service = require('./ai-assist.service');

const generateQuestionCtrl = asyncHandler(async (req, res) => {
  const draft = await service.generateQuestion(req.user.id, req.body);
  return ok(res, draft, 'Draft question generated');
});

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.user.id, req.query);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getOwned(req.params.id, req.user.id);
  return ok(res, item);
});

module.exports = { generateQuestionCtrl, listCtrl, getCtrl };
