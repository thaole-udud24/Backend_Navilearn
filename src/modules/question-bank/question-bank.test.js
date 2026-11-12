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
