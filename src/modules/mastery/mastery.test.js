const { deriveLevel } = require('./mastery.service');

describe('mastery module', () => {
  it('derives level thresholds correctly with the default cut points', () => {
    expect(deriveLevel(10)).toBe('novice');
    expect(deriveLevel(40)).toBe('developing');
    expect(deriveLevel(70)).toBe('proficient');
    expect(deriveLevel(95)).toBe('mastered');
  });

  it('derives level using admin-configured thresholds (UC-BRL-10) instead of the defaults', () => {
    const thresholds = { 'mastery.developing': 20, 'mastery.proficient': 50, 'mastery.mastered': 80 };
    expect(deriveLevel(25, thresholds)).toBe('developing');
    expect(deriveLevel(85, thresholds)).toBe('mastered');
    expect(deriveLevel(10, thresholds)).toBe('novice');
  });
});

jest.mock('./mastery.model');
jest.mock('../business-rule/business-rule.service');

describe('upsertForAttempt (BR-38: no level from a single attempt)', () => {
  const MasteryItem = require('./mastery.model');
  const businessRuleService = require('../business-rule/business-rule.service');
  const { upsertForAttempt } = require('./mastery.service');

  beforeEach(() => {
    businessRuleService.getThresholds.mockResolvedValue({
      'mastery.developing': 40,
      'mastery.proficient': 70,
      'mastery.mastered': 90,
    });
  });

  it('keeps level at novice on the 1st and 2nd attempt even with a high score', async () => {
    MasteryItem.findOne.mockResolvedValueOnce(null);
    MasteryItem.mockImplementation((doc) => ({ ...doc, save: jest.fn().mockResolvedValue(undefined) }));
    const r1 = await upsertForAttempt('owner1', 'c1', 95);
    expect(r1.level).toBe('novice');

    MasteryItem.findOne.mockResolvedValueOnce({
      ...r1,
      history: r1.history,
      save: jest.fn().mockResolvedValue(undefined),
    });
    const r2 = await upsertForAttempt('owner1', 'c1', 95);
    expect(r2.level).toBe('novice');
  });

  it('reflects the real level once the 3rd attempt is reached', async () => {
    MasteryItem.findOne.mockResolvedValueOnce({
      score: 95,
      attemptsCount: 2,
      correctCount: 2,
      history: [],
      save: jest.fn().mockResolvedValue(undefined),
    });
    const r3 = await upsertForAttempt('owner1', 'c1', 95);
    expect(r3.attemptsCount).toBe(3);
    expect(r3.level).toBe('mastered');
  });
});
