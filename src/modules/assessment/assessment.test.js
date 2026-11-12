const { submitSchema } = require('./assessment.validation');

describe('assessment module', () => {
  it('rejects a submission with no answers', () => {
    expect(submitSchema.safeParse({ answers: [] }).success).toBe(false);
  });

  it('accepts a submission with at least 1 answer', () => {
    expect(submitSchema.safeParse({ answers: [{ question: 'q1', selectedOptionIndex: 1 }] }).success).toBe(true);
  });
});
