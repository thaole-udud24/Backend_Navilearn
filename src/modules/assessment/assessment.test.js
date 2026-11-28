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
jest.mock('../wrong-item/wrong-item.service');

describe('submit() (security/correctness)', () => {
  const AssessmentItem = require('./assessment.model');
  const AssessmentConfigItem = require('../assessment-config/assessment-config.model');
  const QuestionItem = require('../question-bank/question-bank.model');
  const masteryService = require('../mastery/mastery.service');
  const wrongItemService = require('../wrong-item/wrong-item.service');
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
    masteryService.findRaw.mockResolvedValue({ score: 40 });
    masteryService.upsertForAttempt.mockResolvedValue({ score: 55 });
    wrongItemService.recordWrong.mockResolvedValue(undefined);
    wrongItemService.markMastered.mockResolvedValue(undefined);
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

  // S12 "Mastery (đo được)": real before→after snapshot, not derived/faked on the client.
  it('snapshots the concept Mastery score before/after the attempt (S12)', async () => {
    AssessmentConfigItem.findById.mockResolvedValue({ questions: ['q1'], passScore: 50, kind: 'practice' });
    const result = await submit('a1', 'owner1', [{ question: 'q1', selectedOptionIndex: 1 }]);
    expect(result.masteryBefore).toBe(40);
    expect(result.masteryAfter).toBe(55);
  });
});

// N2: Sổ câu sai partial-selection retry — scopes the attempt to exactly the checked rows instead
// of every open item for the concept.
describe('startRetryFromWrongItems (N2 partial selection)', () => {
  const AssessmentItem = require('./assessment.model');
  const AssessmentConfigItem = require('../assessment-config/assessment-config.model');
  const wrongItemService = require('../wrong-item/wrong-item.service');
  const { startRetryFromWrongItems } = require('./assessment.service');

  beforeEach(() => {
    jest.clearAllMocks();
    AssessmentConfigItem.findOne.mockResolvedValue({ _id: 'cfg1' });
    AssessmentItem.create.mockImplementation((doc) => Promise.resolve(doc));
  });

  it('attempts only the selected wrongItemIds question ids, not every open item for the concept', async () => {
    wrongItemService.getQuestionIdsForRetry.mockResolvedValue({ concept: 'c1', questionIds: ['q2'] });
    // The concept has 3 open items; the student only checked 1 (q2) in the table.
    wrongItemService.buildRetryQuestionIds.mockResolvedValue(['q1', 'q2', 'q3']);

    const attempt = await startRetryFromWrongItems('owner1', undefined, ['wi2']);

    expect(wrongItemService.getQuestionIdsForRetry).toHaveBeenCalledWith('owner1', ['wi2']);
    expect(attempt.concept).toBe('c1');
    expect(attempt.questionsOverride).toEqual(['q2']);
  });

  it('falls back to every open item for the concept when no wrongItemIds are given (back-compat)', async () => {
    wrongItemService.buildRetryQuestionIds.mockResolvedValue(['q1', 'q2', 'q3']);

    const attempt = await startRetryFromWrongItems('owner1', 'c1', undefined);

    expect(wrongItemService.getQuestionIdsForRetry).not.toHaveBeenCalled();
    expect(attempt.questionsOverride).toEqual(['q1', 'q2', 'q3']);
  });

  it('rejects when the selected wrongItemIds span more than one concept', async () => {
    wrongItemService.getQuestionIdsForRetry.mockRejectedValue(
      Object.assign(new Error('Chỉ có thể chọn các câu cùng một kiến thức trong một lượt luyện lại'), {
        status: 400,
      }),
    );

    await expect(startRetryFromWrongItems('owner1', undefined, ['wi1', 'wi2'])).rejects.toMatchObject({
      status: 400,
    });
  });
});
