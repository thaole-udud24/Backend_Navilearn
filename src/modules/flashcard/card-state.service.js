const ApiError = require('../../utils/ApiError');
const { resolveSubjectConceptIds } = require('../../shared/subjectFilter');
const CardState = require('./card-state.model');
const { FlashcardItem, FlashcardDeckItem } = require('./flashcard.model');

const DAY_MS = 24 * 60 * 60 * 1000;

// SM-2 quality scale (0-5); "again" is the only failing grade.
const GRADE_QUALITY = { again: 0, hard: 3, good: 4, easy: 5 };

async function getOrCreate(ownerId, cardId) {
  const state = await CardState.findOne({ owner: ownerId, card: cardId });
  if (state) return state;
  const card = await FlashcardItem.findById(cardId);
  if (!card) throw ApiError.notFound('Card not found');
  return CardState.create({ owner: ownerId, card: cardId, deck: card.deck, createdBy: ownerId });
}

// Standard SM-2: a lapse ("again") resets repetitions and interval and bumps lapses; a pass grows
// the interval (1 -> 6 -> interval*EF) and nudges EF by the usual quality-based delta (floor 1.3).
async function review(ownerId, cardId, grade) {
  const state = await getOrCreate(ownerId, cardId);
  const quality = GRADE_QUALITY[grade];

  if (grade === 'again') {
    state.lapses += 1;
    state.reps = 0;
    state.intervalDays = 1;
    state.status = 'learning';
  } else {
    state.reps += 1;
    if (state.reps === 1) state.intervalDays = 1;
    else if (state.reps === 2) state.intervalDays = 6;
    else state.intervalDays = Math.round(state.intervalDays * state.easeFactor);
    state.status = state.reps >= 2 ? 'review' : 'learning';
  }

  const easeDelta = 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02);
  state.easeFactor = Math.max(1.3, state.easeFactor + easeDelta);
  state.lastReviewedAt = new Date();
  state.dueAt = new Date(Date.now() + state.intervalDays * DAY_MS);
  state.updatedBy = ownerId;
  await state.save();
  return state;
}

// A card never reviewed before has no CardState row yet (states are otherwise only ever created
// lazily inside review()) — without this, listDue would always be empty for any card no one has
// reviewed yet, i.e. every card, forever. New cards default to status 'new' / dueAt now, so they
// belong in the due queue immediately; this just materializes that default the first time anyone
// asks for the due list, instead of requiring some separate seed step that nothing ever ran.
async function ensureStatesFor(ownerId, cardIds) {
  if (cardIds.length === 0) return;
  const existing = await CardState.find({ owner: ownerId, card: { $in: cardIds } });
  const existingIds = new Set(existing.map((s) => String(s.card)));
  const missing = cardIds.filter((id) => !existingIds.has(String(id)));
  if (missing.length === 0) return;
  const cards = await FlashcardItem.find({ _id: { $in: missing } });
  await CardState.insertMany(
    cards.map((c) => ({ owner: ownerId, card: c._id, deck: c.deck, createdBy: ownerId })),
    { ordered: false },
  ).catch(() => {}); // a concurrent request may have inserted the same rows first — ignore dup-key errors
}

// Due cards for this owner, scoped to active (published) decks — optionally narrowed to one deck
// or one concept's decks.
async function listDue(ownerId, { deckId, concept, subjectId, limit } = {}, requester) {
  const subjectIds = await resolveSubjectConceptIds(subjectId, requester);
  const deckFilter = {
    status: 'active',
    ...(deckId ? { _id: deckId } : {}),
  };
  if (concept && subjectIds) {
    deckFilter.concept = subjectIds.some((id) => String(id) === String(concept)) ? concept : null;
  } else if (concept) {
    deckFilter.concept = concept;
  } else if (subjectIds) {
    deckFilter.concept = { $in: subjectIds };
  }
  const decks = await FlashcardDeckItem.find(deckFilter).select('_id');
  const deckIds = decks.map((d) => d._id);
  if (deckIds.length === 0) return [];

  const activeCards = await FlashcardItem.find({ deck: { $in: deckIds }, status: 'active' });
  await ensureStatesFor(ownerId, activeCards.map((c) => c._id));

  const filter = { owner: ownerId, dueAt: { $lte: new Date() }, deck: { $in: deckIds } };
  const states = await CardState.find(filter)
    .sort({ dueAt: 1 })
    .limit(limit || 20)
    .populate('card')
    .populate('deck', 'title');
  // A card can be archived after its state row exists — don't surface it for review.
  return states.filter((s) => s.card && s.card.status === 'active');
}

async function getStats(ownerId, { deckId, subjectId } = {}, requester) {
  const subjectIds = await resolveSubjectConceptIds(subjectId, requester);
  let deckFilter = deckId ? { deck: deckId } : {};
  if (!deckId && subjectIds) {
    const decks = await FlashcardDeckItem.find({ status: 'active', concept: { $in: subjectIds } }).select('_id');
    deckFilter = { deck: { $in: decks.map((d) => d._id) } };
  }
  const filter = { owner: ownerId, ...deckFilter };
  const [newCount, learningCount, reviewCount, dueCount] = await Promise.all([
    CardState.countDocuments({ ...filter, status: 'new' }),
    CardState.countDocuments({ ...filter, status: 'learning' }),
    CardState.countDocuments({ ...filter, status: 'review' }),
    CardState.countDocuments({ ...filter, dueAt: { $lte: new Date() } }),
  ]);
  return { new: newCount, learning: learningCount, review: reviewCount, due: dueCount };
}

module.exports = { getOrCreate, review, listDue, getStats };
