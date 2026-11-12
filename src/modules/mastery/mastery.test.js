const { deriveLevel } = require('./mastery.service');

describe('mastery module', () => {
  it('derives level thresholds correctly', () => {
    expect(deriveLevel(10)).toBe('novice');
    expect(deriveLevel(40)).toBe('developing');
    expect(deriveLevel(70)).toBe('proficient');
    expect(deriveLevel(95)).toBe('mastered');
  });
});

jest.mock('./mastery.model');

describe('upsertForAttempt (BR-38: no level from a single attempt)', () => {
  const MasteryItem = require('./mastery.model');
  const { upsertForAttempt } = require('./mastery.service');

  it('keeps level at novice on the 1st and 2nd attempt even with a high score', async () => {
    MasteryItem.findOne.mockResolvedValueOnce(null);
    const saved1 = { save: jest.fn().mockResolvedValue(undefined) };
    MasteryItem.mockImplementation((doc) => Object.assign(saved1, doc));
    const r1 = await upsertForAttempt('owner1', 'c1', 95);
    expect(r1.level).toBe('novice');

    MasteryItem.findOne.mockResolvedValueOnce({ ...r1, save: jest.fn().mockResolvedValue(undefined) });
    const r2 = await upsertForAttempt('owner1', 'c1', 95);
    expect(r2.level).toBe('novice');
  });

  it('reflects the real level once the 3rd attempt is reached', async () => {
    MasteryItem.findOne.mockResolvedValueOnce({
      score: 95,
      attemptsCount: 2,
      correctCount: 2,
      save: jest.fn().mockResolvedValue(undefined),
    });
    const r3 = await upsertForAttempt('owner1', 'c1', 95);
    expect(r3.attemptsCount).toBe(3);
    expect(r3.level).toBe('mastered');
  });
});
