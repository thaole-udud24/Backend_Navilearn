const {
  createSchema,
  updateSchema,
  reportIssueSchema,
  resolveIssueReportSchema,
} = require('./question-bank.validation');

describe('question-bank module', () => {
  it('rejects an MCQ with no correct option', () => {
    const result = createSchema.safeParse({
      concept: 'c1',
      type: 'mcq',
      text: '2+2=?',
      options: [{ text: '3' }, { text: '4' }],
    });
    expect(result.success).toBe(false);
  });

  it('accepts an MCQ with exactly one correct option', () => {
    const result = createSchema.safeParse({
      concept: 'c1',
      type: 'mcq',
      text: '2+2=?',
      options: [{ text: '3' }, { text: '4', isCorrect: true }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts an essay question without options', () => {
    const result = createSchema.safeParse({
      concept: 'c1',
      type: 'essay',
      text: 'Giải thích định lý Pytago',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an update with no fields (UC-QBK-04)', () => {
    expect(updateSchema.safeParse({}).success).toBe(false);
  });

  it('accepts a partial update with a single field', () => {
    expect(updateSchema.safeParse({ text: 'New wording' }).success).toBe(true);
  });

  it('rejects an issue report with an unknown reason (UC-ASM-16)', () => {
    expect(reportIssueSchema.safeParse({ reason: 'spam' }).success).toBe(false);
  });

  it('accepts a valid issue report', () => {
    expect(
      reportIssueSchema.safeParse({ reason: 'wrong_answer', description: 'Option B is correct' }).success,
    ).toBe(true);
  });

  it('rejects resolving an issue report with an unknown action (UC-QBK-12)', () => {
    expect(resolveIssueReportSchema.safeParse({ action: 'ignore' }).success).toBe(false);
  });
});

jest.mock('./question-bank.model', () => ({ find: jest.fn(), countDocuments: jest.fn() }));

describe('question-bank list() status filter (security)', () => {
  const QuestionItem = require('./question-bank.model');
  const { list } = require('./question-bank.service');

  beforeEach(() => {
    QuestionItem.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => [] }) }) });
    QuestionItem.countDocuments.mockResolvedValue(0);
  });

  it('forces status=active for a student even if they ask for a different status', async () => {
    await list({ status: 'archived' }, { role: 'student' });
    expect(QuestionItem.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });

  it('lets an admin request a specific status', async () => {
    await list({ status: 'archived' }, { role: 'admin' });
    expect(QuestionItem.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived' }));
  });
});
