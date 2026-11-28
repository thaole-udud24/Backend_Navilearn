jest.mock('./wrong-item.model');

const WrongItem = require('./wrong-item.model');
const { recordWrong, list, buildRetryQuestionIds, getQuestionIdsForRetry } = require('./wrong-item.service');

describe('recordWrong (upsert on owner+question)', () => {
  afterEach(() => jest.clearAllMocks());

  it('creates a new row on the first miss', async () => {
    WrongItem.findOne.mockResolvedValueOnce(null);
    WrongItem.create.mockResolvedValueOnce({ wrongCount: 1, status: 'open' });
    const item = await recordWrong('owner1', 'q1', 'concept1');
    expect(WrongItem.create).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'owner1', question: 'q1', concept: 'concept1', wrongCount: 1, status: 'open' }),
    );
    expect(item.wrongCount).toBe(1);
  });

  it('increments wrongCount and re-opens a mastered row on a repeat miss', async () => {
    const save = jest.fn().mockResolvedValue(undefined);
    WrongItem.findOne.mockResolvedValueOnce({ wrongCount: 2, status: 'mastered', save });
    const item = await recordWrong('owner1', 'q1', 'concept1');
    expect(item.wrongCount).toBe(3);
    expect(item.status).toBe('open');
    expect(save).toHaveBeenCalled();
  });
});

describe('list (filters by status/concept)', () => {
  it('passes the owner, status and concept filter through to the query', async () => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn(),
    };
    // First populate('question', ...) returns the chain again, second populate('concept', ...)
    // resolves (mirrors mongoose's thenable query after the last populate).
    chain.populate.mockReturnValueOnce(chain).mockReturnValueOnce(Promise.resolve([]));
    WrongItem.find.mockReturnValue(chain);
    WrongItem.countDocuments.mockResolvedValue(0);

    await list('owner1', { status: 'open', concept: 'concept1' });
    expect(WrongItem.find).toHaveBeenCalledWith({ owner: 'owner1', status: 'open', concept: 'concept1' });
  });
});

describe('buildRetryQuestionIds (open items only)', () => {
  it('returns question ids for open items scoped to the owner (and concept when given)', async () => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      select: jest.fn().mockResolvedValue([{ question: 'q1' }, { question: 'q2' }]),
    };
    WrongItem.find.mockReturnValue(chain);

    const ids = await buildRetryQuestionIds('owner1', { concept: 'concept1' });
    expect(WrongItem.find).toHaveBeenCalledWith({ owner: 'owner1', status: 'open', concept: 'concept1' });
    expect(ids).toEqual(['q1', 'q2']);
  });
});

describe('getQuestionIdsForRetry (N2 partial-selection retry by explicit ids)', () => {
  afterEach(() => jest.clearAllMocks());

  it('returns only the checked items\' question ids plus their shared concept', async () => {
    WrongItem.find.mockResolvedValueOnce([
      { _id: 'wi1', question: 'q1', concept: 'c1' },
      { _id: 'wi2', question: 'q2', concept: 'c1' },
    ]);

    const result = await getQuestionIdsForRetry('owner1', ['wi1', 'wi2']);

    expect(WrongItem.find).toHaveBeenCalledWith({ _id: { $in: ['wi1', 'wi2'] }, owner: 'owner1', status: 'open' });
    expect(result).toEqual({ concept: 'c1', questionIds: ['q1', 'q2'] });
  });

  it('rejects when a selected id is not owned/open (fewer rows found than requested)', async () => {
    WrongItem.find.mockResolvedValueOnce([{ _id: 'wi1', question: 'q1', concept: 'c1' }]);

    await expect(getQuestionIdsForRetry('owner1', ['wi1', 'wi2'])).rejects.toMatchObject({ status: 400 });
  });

  it('rejects when the selection spans more than one concept', async () => {
    WrongItem.find.mockResolvedValueOnce([
      { _id: 'wi1', question: 'q1', concept: 'c1' },
      { _id: 'wi2', question: 'q2', concept: 'c2' },
    ]);

    await expect(getQuestionIdsForRetry('owner1', ['wi1', 'wi2'])).rejects.toMatchObject({ status: 400 });
  });
});
