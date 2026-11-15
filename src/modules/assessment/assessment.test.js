const { submitSchema, draftSchema, flagSchema, compareQuerySchema } = require('./assessment.validation');

describe('assessment module', () => {
  it('rejects a submission with no answers', () => {
    expect(submitSchema.safeParse({ answers: [] }).success).toBe(false);
  });

  it('accepts a submission with at least 1 answer', () => {
    expect(submitSchema.safeParse({ answers: [{ question: 'q1', selectedOptionIndex: 1 }] }).success).toBe(
      true,
    );
  });

  it('accepts a draft save with a partial answer (UC-ASM-18)', () => {
    expect(draftSchema.safeParse({ answers: [{ question: 'q1' }] }).success).toBe(true);
  });

  it('rejects a flag update missing the flagged boolean (UC-ASM-17)', () => {
    expect(flagSchema.safeParse({ question: 'q1' }).success).toBe(false);
  });

  it('accepts a flag update', () => {
    expect(flagSchema.safeParse({ question: 'q1', flagged: true }).success).toBe(true);
  });

  it('requires a concept to compare attempts (UC-ASM-05)', () => {
    expect(compareQuerySchema.safeParse({}).success).toBe(false);
    expect(compareQuerySchema.safeParse({ concept: 'c1' }).success).toBe(true);
  });
});

jest.mock('./assessment.model');
jest.mock('../assessment-config/assessment-config.model');
jest.mock('../question-bank/question-bank.model');
jest.mock('../mastery/mastery.service');

describe('submit() (security/correctness)', () => {
  const AssessmentItem = require('./assessment.model');
  const AssessmentConfigItem = require('../assessment-config/assessment-config.model');
  const QuestionItem = require('../question-bank/question-bank.model');
  const masteryService = require('../mastery/mastery.service');
  const { submit } = require('./assessment.service');

  const baseAttempt = () => ({
    owner: 'owner1',
    concept: 'c1',
    status: 'in_progress',
    assessmentConfig: 'cfg1',
    questionsOverride: [],
    answers: [],
    scoreHistory: [],
    save: jest.fn().mockResolvedValue(undefined),
  });

  beforeEach(() => {
    jest.clearAllMocks();
    AssessmentItem.findById.mockResolvedValue(baseAttempt());
    QuestionItem.find.mockResolvedValue([
      { _id: 'q1', points: 10, type: 'mcq', options: [{ isCorrect: false }, { isCorrect: true }] },
    ]);
    masteryService.upsertForAttempt.mockResolvedValue(undefined);
  });

  it('throws a clean 404 instead of crashing when the config was deleted mid-attempt', async () => {
    AssessmentConfigItem.findById.mockResolvedValue(null);
    await expect(submit('a1', 'owner1', [{ question: 'q1', selectedOptionIndex: 1 }])).rejects.toMatchObject({
      status: 404,
    });
  });

  it('does not double-count a question id submitted twice', async () => {
    AssessmentConfigItem.findById.mockResolvedValue({ questions: ['q1'], passScore: 50, kind: 'quiz' });
    // Dedup keeps the last occurrence; the second (wrong) answer for q1 wins, so totalPoints stays
    // at 10 (1 question), not 20 — the bug being guarded against is totalPoints/earnedTotal double
    // counting q1, not which duplicate "wins".
    const result = await submit('a1', 'owner1', [
      { question: 'q1', selectedOptionIndex: 1 },
      { question: 'q1', selectedOptionIndex: 0 },
    ]);
    expect(result.answers).toHaveLength(1);
    expect(result.score).toBe(0);
  });
});
