jest.mock('./flashcard.model');
jest.mock('../knowledge/knowledge.model');

describe('flashcard validation', () => {
  const { createDeckSchema, createCardSchema } = require('./flashcard.validation');
  const cid = 'a'.repeat(24);

  it('accepts a valid deck', () => {
    expect(createDeckSchema.safeParse({ title: 'Bộ 1', concept: cid }).success).toBe(true);
  });

  it('rejects a deck with bad concept id', () => {
    expect(createDeckSchema.safeParse({ title: 'Bộ 1', concept: 'x' }).success).toBe(false);
  });

  it('accepts a valid card and rejects an empty one', () => {
    expect(createCardSchema.safeParse({ front: 'Q', back: 'A' }).success).toBe(true);
    expect(createCardSchema.safeParse({ front: '', back: 'A' }).success).toBe(false);
  });
});

describe('flashcard service', () => {
  const { FlashcardDeckItem, FlashcardItem } = require('./flashcard.model');
  const Concept = require('../knowledge/knowledge.model');
  const service = require('./flashcard.service');
  const cid = 'a'.repeat(24);

  beforeEach(() => {
    jest.clearAllMocks();
    Concept.exists.mockResolvedValue(true);
  });

  it('createDeck rejects a concept that does not exist', async () => {
    Concept.exists.mockResolvedValue(false);
    await expect(service.createDeck('admin1', { title: 'T', concept: cid })).rejects.toMatchObject({
      status: 400,
      code: 'CONCEPT_NOT_FOUND',
    });
  });

  it('removeDeck refuses when the deck still has cards', async () => {
    FlashcardDeckItem.findById.mockReturnValue({ populate: () => ({ _id: 'd1' }) });
    FlashcardItem.countDocuments.mockResolvedValue(3);
    await expect(service.removeDeck('d1', 'admin1')).rejects.toMatchObject({
      status: 409,
      code: 'DECK_NOT_EMPTY',
    });
  });

  it('createCard rejects when the deck does not exist', async () => {
    FlashcardDeckItem.findById.mockResolvedValue(null);
    await expect(service.createCard('d1', 'admin1', { front: 'Q', back: 'A' })).rejects.toMatchObject({
      status: 404,
    });
  });

  it('createCard succeeds for an existing deck', async () => {
    FlashcardDeckItem.findById.mockResolvedValue({ _id: 'd1' });
    FlashcardItem.create.mockResolvedValue({ _id: 'c1' });
    await expect(service.createCard('d1', 'admin1', { front: 'Q', back: 'A' })).resolves.toMatchObject({
      _id: 'c1',
    });
  });
});
