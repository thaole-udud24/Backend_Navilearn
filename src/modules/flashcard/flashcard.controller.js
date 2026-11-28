const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const service = require('./flashcard.service');

const listDecksCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listDecks(req.query, req.user);
  return ok(res, items, 'OK', meta);
});

const getDeckCtrl = asyncHandler(async (req, res) => {
  const item = await service.getDeckById(req.params.id);
  return ok(res, item);
});

const createDeckCtrl = asyncHandler(async (req, res) => {
  const item = await service.createDeck(req.user.id, req.body);
  return created(res, item, 'Deck created');
});

const updateDeckCtrl = asyncHandler(async (req, res) => {
  const item = await service.updateDeck(req.params.id, req.user.id, req.body);
  return ok(res, item, 'Deck updated');
});

const updateDeckStatusCtrl = asyncHandler(async (req, res) => {
  const item = await service.updateDeckStatus(req.params.id, req.user.id, req.body.status);
  return ok(res, item, 'Deck status updated');
});

const removeDeckCtrl = asyncHandler(async (req, res) => {
  await service.removeDeck(req.params.id, req.user.id);
  return noContent(res);
});

const listCardsCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listCards(req.params.deckId, req.query);
  return ok(res, items, 'OK', meta);
});

const createCardCtrl = asyncHandler(async (req, res) => {
  const item = await service.createCard(req.params.deckId, req.user.id, req.body);
  return created(res, item, 'Card created');
});

const updateCardCtrl = asyncHandler(async (req, res) => {
  const item = await service.updateCard(req.params.deckId, req.params.id, req.user.id, req.body);
  return ok(res, item, 'Card updated');
});

const updateCardStatusCtrl = asyncHandler(async (req, res) => {
  const item = await service.updateCardStatus(req.params.deckId, req.params.id, req.user.id, req.body.status);
  return ok(res, item, 'Card status updated');
});

const removeCardCtrl = asyncHandler(async (req, res) => {
  await service.removeCard(req.params.deckId, req.params.id, req.user.id);
  return noContent(res);
});

module.exports = {
  listDecksCtrl,
  getDeckCtrl,
  createDeckCtrl,
  updateDeckCtrl,
  updateDeckStatusCtrl,
  removeDeckCtrl,
  listCardsCtrl,
  createCardCtrl,
  updateCardCtrl,
  updateCardStatusCtrl,
  removeCardCtrl,
};
