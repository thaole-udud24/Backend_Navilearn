const { createSchema } = require('./assessment-config.validation');

describe('assessment-config module', () => {
  it('rejects a config with no questions', () => {
    const result = createSchema.safeParse({ title: 'Quiz 1', concept: 'c1', questions: [] });
    expect(result.success).toBe(false);
  });

  it('accepts a config with at least 1 question', () => {
    const result = createSchema.safeParse({ title: 'Quiz 1', concept: 'c1', questions: ['q1'] });
    expect(result.success).toBe(true);
  });
});
