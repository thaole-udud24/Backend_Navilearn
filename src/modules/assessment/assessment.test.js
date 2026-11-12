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
