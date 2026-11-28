const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { resolveSubjectConceptIds } = require('../../shared/subjectFilter');
const { FlashcardDeckItem, FlashcardItem } = require('./flashcard.model');
const Concept = require('../knowledge/knowledge.model');

async function assertConceptExists(conceptId) {
  const exists = await Concept.exists({ _id: conceptId });
  if (!exists) throw ApiError.badRequest('Concept not found', 'CONCEPT_NOT_FOUND');
}

async function listDecks(query, requester) {
  const { page, limit, skip } = parsePagination(query);
  const subjectIds = await resolveSubjectConceptIds(query.subjectId, requester);
  const filter = {
    ...(query.status ? { status: query.status } : {}),
  };
  if (query.concept && subjectIds) {
    filter.concept = subjectIds.some((id) => String(id) === String(query.concept)) ? query.concept : null;
  } else if (query.concept) {
    filter.concept = query.concept;
  } else if (subjectIds) {
    filter.concept = { $in: subjectIds };
  }
  const [items, total] = await Promise.all([
    FlashcardDeckItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('concept', 'name'),
    FlashcardDeckItem.countDocuments(filter),
  ]);
  // Real card count per deck, shown on the deck's collection card — aggregate() skips the
  // soft-delete query middleware, so `deletedAt: null` must be repeated here.
  const counts = await FlashcardItem.aggregate([
    { $match: { deck: { $in: items.map((d) => d._id) }, deletedAt: null } },
    { $group: { _id: '$deck', count: { $sum: 1 } } },
  ]);
  const countByDeck = new Map(counts.map((c) => [String(c._id), c.count]));
  const withCardCount = items.map((d) => ({ ...d.toObject(), cardCount: countByDeck.get(String(d._id)) ?? 0 }));
  return { items: withCardCount, meta: buildMeta(page, limit, total) };
}

async function getDeckById(id) {
  const deck = await FlashcardDeckItem.findById(id).populate('concept', 'name');
  if (!deck) throw ApiError.notFound('Deck not found');
  return deck;
}

async function createDeck(requesterId, data) {
  await assertConceptExists(data.concept);
  return FlashcardDeckItem.create({ ...data, createdBy: requesterId });
}

async function updateDeck(id, requesterId, data) {
  const deck = await getDeckById(id);
  if (data.concept) await assertConceptExists(data.concept);
  Object.assign(deck, data, { updatedBy: requesterId });
  await deck.save();
  return deck;
}

async function updateDeckStatus(id, requesterId, status) {
  const deck = await getDeckById(id);
  deck.status = status;
  deck.updatedBy = requesterId;
  await deck.save();
  return deck;
}

// A deck with cards still in it can't be deleted outright — same "refuse instead of dangling
// reference" rule knowledge.service.remove uses for Concept.
async function removeDeck(id, requesterId) {
  const deck = await getDeckById(id);
  const cardCount = await FlashcardItem.countDocuments({ deck: id });
  if (cardCount > 0) {
    throw ApiError.conflict(`Bộ thẻ còn ${cardCount} thẻ — xoá hết thẻ trước`, 'DECK_NOT_EMPTY');
  }
  deck.updatedBy = requesterId;
  await deck.softDelete();
}

async function assertDeckExists(deckId) {
  const deck = await FlashcardDeckItem.findById(deckId);
  if (!deck) throw ApiError.notFound('Deck not found');
  return deck;
}

async function listCards(deckId, query) {
  await assertDeckExists(deckId);
  const { page, limit, skip } = parsePagination(query);
  const filter = { deck: deckId, ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    FlashcardItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    FlashcardItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getCard(deckId, id) {
  const card = await FlashcardItem.findOne({ _id: id, deck: deckId });
  if (!card) throw ApiError.notFound('Card not found');
  return card;
}

async function createCard(deckId, requesterId, data) {
  await assertDeckExists(deckId);
  return FlashcardItem.create({ ...data, deck: deckId, createdBy: requesterId });
}

async function updateCard(deckId, id, requesterId, data) {
  const card = await getCard(deckId, id);
  Object.assign(card, data, { updatedBy: requesterId });
  await card.save();
  return card;
}

async function updateCardStatus(deckId, id, requesterId, status) {
  const card = await getCard(deckId, id);
  card.status = status;
  card.updatedBy = requesterId;
  await card.save();
  return card;
}

async function removeCard(deckId, id, requesterId) {
  const card = await getCard(deckId, id);
  card.updatedBy = requesterId;
  await card.softDelete();
}

module.exports = {
  listDecks,
  getDeckById,
  createDeck,
  updateDeck,
  updateDeckStatus,
  removeDeck,
  listCards,
  getCard,
  createCard,
  updateCard,
  updateCardStatus,
  removeCard,
};
