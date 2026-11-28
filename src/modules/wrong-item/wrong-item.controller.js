const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const service = require('./wrong-item.service');

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.user.id, req.query, req.user);
  return ok(res, items, 'OK', meta);
});

const retryQuestionIdsCtrl = asyncHandler(async (req, res) => {
  const { concept, limit } = req.query;
  const questionIds = await service.buildRetryQuestionIds(req.user.id, {
    concept,
    limit: limit ? Number(limit) : undefined,
  });
  return ok(res, { questionIds });
});

const markMasteredCtrl = asyncHandler(async (req, res) => {
  const item = await service.markMasteredById(req.params.id, req.user.id);
  return ok(res, item, 'Marked mastered');
});

module.exports = { listCtrl, retryQuestionIdsCtrl, markMasteredCtrl };
