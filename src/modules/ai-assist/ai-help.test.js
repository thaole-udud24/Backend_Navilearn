jest.mock('../assessment/assessment.model', () => ({
  findOne: jest.fn(),
  updateOne: jest.fn(),
  countDocuments: jest.fn(),
}));

jest.mock('../assessment-config/assessment-config.model', () => ({
  findById: jest.fn(),
}));

const AssessmentConfigItem = require('../assessment-config/assessment-config.model');

const AssessmentItem = require('../assessment/assessment.model');
const { assertActiveAttempt, recordHelp, getAiHelpRatio } = require('./ai-help.service');

beforeEach(() => {
  jest.clearAllMocks();
  AssessmentConfigItem.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({ kind: 'practice' }),
  });
});

it('only accepts an in-progress attempt for the same concept', async () => {
  AssessmentItem.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({ concept: 'c1', independentCheck: false, assessmentConfig: 'cfg1' }),
  });
  await expect(assertActiveAttempt('u1', 'a1', 'c1')).resolves.toBeUndefined();
  await expect(assertActiveAttempt('u1', 'a1', 'c2')).rejects.toMatchObject({ status: 400 });
  expect(AssessmentItem.findOne).toHaveBeenCalledWith({
    _id: 'a1',
    owner: 'u1',
    status: 'in_progress',
  });
});

it('records the server-defined help level atomically', async () => {
  AssessmentItem.updateOne.mockResolvedValue({ matchedCount: 1 });
  await recordHelp('u1', 'a1', 'c1', 'qa');
  expect(AssessmentItem.updateOne).toHaveBeenCalledWith(
    { _id: 'a1', owner: 'u1', concept: 'c1', status: 'in_progress', independentCheck: { $ne: true } },
    { $max: { aiHelpLevel: 2 }, $inc: { aiHelpCount: 1 } },
  );
});

it('calculates the fraction of submitted attempts assisted by AI', async () => {
  AssessmentItem.countDocuments.mockResolvedValueOnce(4).mockResolvedValueOnce(2);
  await expect(getAiHelpRatio('u1', 'c1')).resolves.toEqual({
    totalAttempts: 4,
    assistedAttempts: 2,
    aiHelpRatio: 0.5,
  });
  expect(AssessmentItem.countDocuments).toHaveBeenNthCalledWith(1, {
    owner: 'u1',
    status: 'submitted',
    independentCheck: { $ne: true },
    concept: 'c1',
  });
});

it('returns 50% when one of two submitted attempts used AI', async () => {
  AssessmentItem.countDocuments
    .mockResolvedValueOnce(2) // tổng bài đã nộp
    .mockResolvedValueOnce(1); // bài có aiHelpLevel > 0

  await expect(getAiHelpRatio('u1')).resolves.toEqual({
    totalAttempts: 2,
    assistedAttempts: 1,
    aiHelpRatio: 0.5,
  });
});

it('blocks AI for an independent check', async () => {
  AssessmentItem.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      concept: 'c1',
      independentCheck: true,
      assessmentConfig: 'cfg1',
    }),
  });

  await expect(assertActiveAttempt('u1', 'a1', 'c1')).rejects.toMatchObject({ status: 403 });
});

it('blocks AI for a placement assessment', async () => {
  AssessmentItem.findOne.mockReturnValue({
    select: jest.fn().mockResolvedValue({
      concept: 'c1',
      independentCheck: false,
      assessmentConfig: 'cfg1',
    }),
  });
  AssessmentConfigItem.findById.mockReturnValue({
    select: jest.fn().mockResolvedValue({ kind: 'placement' }),
  });

  await expect(assertActiveAttempt('u1', 'a1', 'c1')).rejects.toMatchObject({ status: 403 });
});
