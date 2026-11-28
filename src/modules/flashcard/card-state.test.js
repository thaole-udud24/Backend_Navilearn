jest.mock('./card-state.model');
jest.mock('./flashcard.model');

describe('card-state validation', () => {
  const { reviewSchema } = require('./card-state.validation');

  it('accepts a known grade and rejects an unknown one', () => {
    expect(reviewSchema.safeParse({ grade: 'good' }).success).toBe(true);
    expect(reviewSchema.safeParse({ grade: 'meh' }).success).toBe(false);
  });
});

describe('card-state service', () => {
  const CardState = require('./card-state.model');
  const { FlashcardItem, FlashcardDeckItem } = require('./flashcard.model');
  const service = require('./card-state.service');
  const ownerId = 'owner1';
  const cardId = 'card1';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('getOrCreate makes a new card due immediately', async () => {
    CardState.findOne.mockResolvedValue(null);
    FlashcardItem.findById.mockResolvedValue({ _id: cardId, deck: 'deck1' });
    const created = { _id: 'cs1', dueAt: new Date(), status: 'new' };
    CardState.create.mockResolvedValue(created);

    const state = await service.getOrCreate(ownerId, cardId);

    expect(state).toBe(created);
    expect(CardState.create).toHaveBeenCalledWith(
      expect.objectContaining({ owner: ownerId, card: cardId, deck: 'deck1' }),
    );
    expect(created.dueAt.getTime()).toBeLessThanOrEqual(Date.now());
  });

  function makeExistingState(overrides = {}) {
    return {
      owner: ownerId,
      card: cardId,
      deck: 'deck1',
      status: 'new',
      easeFactor: 2.5,
      intervalDays: 0,
      reps: 0,
      lapses: 0,
      dueAt: new Date(),
      lastReviewedAt: null,
      save: jest.fn().mockResolvedValue(undefined),
      ...overrides,
    };
  }

  it('a "good" review moves the card to review status with a positive interval', async () => {
    const existing = makeExistingState({ reps: 1, intervalDays: 1, status: 'learning' });
    CardState.findOne.mockResolvedValue(existing);

    const result = await service.review(ownerId, cardId, 'good');

    expect(result.reps).toBe(2);
    expect(result.intervalDays).toBe(6);
    expect(result.status).toBe('review');
    expect(result.dueAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('an "again" review resets the interval and increments lapses', async () => {
    const existing = makeExistingState({ reps: 3, intervalDays: 20, status: 'review', lapses: 0 });
    CardState.findOne.mockResolvedValue(existing);

    const result = await service.review(ownerId, cardId, 'again');

    expect(result.lapses).toBe(1);
    expect(result.reps).toBe(0);
    expect(result.intervalDays).toBe(1);
    expect(result.status).toBe('learning');
  });

  // Jest's automocking of flashcard.model.js gives FlashcardItem and FlashcardDeckItem the exact
  // same mocked `find` function (both inherit it from mongoose.Model's static, and automock treats
  // it as one shared property) — confirmed via `FlashcardItem.find === FlashcardDeckItem.find`.
  // So every `.find(...)` call in listDue/ensureStatesFor, on either model, must be queued on
  // `FlashcardItem.find` (equivalently `FlashcardDeckItem.find`) in the exact order the service
  // calls them, not configured independently per model.
  it('listDue only returns cards whose dueAt has passed, scoped to active decks', async () => {
    FlashcardItem.find
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue([{ _id: 'deck1' }]) }) // deck lookup
      .mockResolvedValueOnce([{ _id: cardId, deck: 'deck1' }]); // active cards in scope
    const dueCard = { card: { status: 'active' }, deck: { title: 'D' } };
    const findChain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
    };
    findChain.populate = jest
      .fn()
      .mockReturnValueOnce(findChain)
      .mockResolvedValueOnce([dueCard]);
    // 1st CardState.find: ensureStatesFor's "which cards already have a state" check (already has one).
    // 2nd CardState.find: the actual due-query chain asserted on below.
    CardState.find.mockResolvedValueOnce([{ card: cardId }]).mockReturnValueOnce(findChain);

    const items = await service.listDue(ownerId, {});

    expect(items).toEqual([dueCard]);
    expect(CardState.find).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ owner: ownerId, deck: { $in: [{ _id: 'deck1' }].map((d) => d._id) } }),
    );
    expect(CardState.find.mock.calls[1][0].dueAt).toHaveProperty('$lte');
  });

  it('listDue returns nothing when the owner has no active decks', async () => {
    FlashcardDeckItem.find.mockReturnValue({ select: jest.fn().mockResolvedValue([]) });
    const items = await service.listDue(ownerId, {});
    expect(items).toEqual([]);
    expect(CardState.find).not.toHaveBeenCalled();
  });

  it('listDue auto-creates a CardState for a card no one has reviewed yet (new content is due immediately)', async () => {
    FlashcardItem.find
      .mockReturnValueOnce({ select: jest.fn().mockResolvedValue([{ _id: 'deck1' }]) }) // deck lookup
      .mockResolvedValueOnce([{ _id: cardId, deck: 'deck1' }]) // active cards in scope
      .mockResolvedValueOnce([{ _id: cardId, deck: 'deck1' }]); // re-fetched to build the missing states
    const findChain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockReturnThis(),
    };
    findChain.populate = jest.fn().mockReturnValueOnce(findChain).mockResolvedValueOnce([]);
    CardState.find.mockResolvedValueOnce([]).mockReturnValueOnce(findChain); // no existing state for cardId
    CardState.insertMany.mockResolvedValue([]);

    await service.listDue(ownerId, {});

    expect(CardState.insertMany).toHaveBeenCalledWith(
      [expect.objectContaining({ owner: ownerId, card: cardId, deck: 'deck1' })],
      expect.objectContaining({ ordered: false }),
    );
  });
});
