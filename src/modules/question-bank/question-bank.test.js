const { createSchema } = require('./question-bank.validation');

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
    const result = createSchema.safeParse({ concept: 'c1', type: 'essay', text: 'Giải thích định lý Pytago' });
    expect(result.success).toBe(true);
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

  it('lets an admin see every status when none is requested', async () => {
    await list({}, { role: 'admin' });
    expect(QuestionItem.find).toHaveBeenCalledWith(expect.not.objectContaining({ status: expect.anything() }));
  });
});
