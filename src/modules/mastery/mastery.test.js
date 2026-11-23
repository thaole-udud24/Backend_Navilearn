const { deriveLevel, nextLearningStateForAttempt, computeDisplayState } = require('./mastery.service');

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

describe('nextLearningStateForAttempt (BR-39)', () => {
  it('moves LEARNING to PRACTICING on the first practice attempt', () => {
    expect(nextLearningStateForAttempt('LEARNING', { score: 30, evidenceCount: 1 })).toBe('PRACTICING');
  });

  it('does not move PRACTICING to UNDERSTOOD with only 1 evidence even at a high score', () => {
    expect(nextLearningStateForAttempt('PRACTICING', { score: 90, evidenceCount: 1 })).toBe('PRACTICING');
  });

  it('moves PRACTICING to UNDERSTOOD at score>=70 with >=2 evidence', () => {
    expect(nextLearningStateForAttempt('PRACTICING', { score: 70, evidenceCount: 2 })).toBe('UNDERSTOOD');
  });

  it('moves UNDERSTOOD to APPLIED only via an independent check scoring >=80', () => {
    expect(
      nextLearningStateForAttempt('UNDERSTOOD', { score: 79, evidenceCount: 5, independentCheck: true }),
    ).toBe('UNDERSTOOD');
    expect(
      nextLearningStateForAttempt('UNDERSTOOD', { score: 85, evidenceCount: 5, independentCheck: false }),
    ).toBe('UNDERSTOOD');
    expect(
      nextLearningStateForAttempt('UNDERSTOOD', { score: 85, evidenceCount: 5, independentCheck: true }),
    ).toBe('APPLIED');
  });

  it('a new attempt moves DECAY_RISK back to PRACTICING ("ôn lại")', () => {
    expect(nextLearningStateForAttempt('DECAY_RISK', { score: 40, evidenceCount: 5 })).toBe('PRACTICING');
  });
});

describe('computeDisplayState (BR-39 decay, read-only derivation)', () => {
  it('flags DECAY_RISK when score drops below 60, without mutating stored state', () => {
    const item = { learningState: 'UNDERSTOOD', score: 55, lastAttemptAt: new Date() };
    expect(computeDisplayState(item)).toBe('DECAY_RISK');
    expect(item.learningState).toBe('UNDERSTOOD');
  });

  it('flags DECAY_RISK when last attempt was over 14 days ago', () => {
    const fifteenDaysAgo = new Date(Date.now() - 15 * 24 * 60 * 60 * 1000);
    const item = { learningState: 'PRACTICING', score: 80, lastAttemptAt: fifteenDaysAgo };
    expect(computeDisplayState(item)).toBe('DECAY_RISK');
  });

  it('does not flag LEARNING as decay-eligible', () => {
    const item = { learningState: 'LEARNING', score: 0, lastAttemptAt: null };
    expect(computeDisplayState(item)).toBe('LEARNING');
  });

  it('keeps a healthy PRACTICING state as-is', () => {
    const item = { learningState: 'PRACTICING', score: 80, lastAttemptAt: new Date() };
    expect(computeDisplayState(item)).toBe('PRACTICING');
  });
});
