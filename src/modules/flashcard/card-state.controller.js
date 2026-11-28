const asyncHandler = require('../../utils/asyncHandler');
const { ok } = require('../../utils/response');
const service = require('./card-state.service');

const listDueCtrl = asyncHandler(async (req, res) => {
  const { deck, concept, subjectId, limit } = req.query;
  const items = await service.listDue(
    req.user.id,
    { deckId: deck, concept, subjectId, limit: limit ? Number(limit) : undefined },
    req.user,
  );
  return ok(res, items);
});

const reviewCtrl = asyncHandler(async (req, res) => {
  const item = await service.review(req.user.id, req.params.cardId, req.body.grade);
  return ok(res, item, 'Reviewed');
});

const statsCtrl = asyncHandler(async (req, res) => {
  const stats = await service.getStats(
    req.user.id,
    { deckId: req.query.deck, subjectId: req.query.subjectId },
    req.user,
  );
  return ok(res, stats);
});

module.exports = { listDueCtrl, reviewCtrl, statsCtrl };
