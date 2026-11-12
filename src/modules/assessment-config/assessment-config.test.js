const { createSchema, updateSchema, createRubricSchema } = require('./assessment-config.validation');

describe('assessment-config module', () => {
  it('rejects a config with no questions', () => {
    const result = createSchema.safeParse({ title: 'Quiz 1', concept: 'c1', questions: [] });
    expect(result.success).toBe(false);
  });

  it('accepts a config with at least 1 question', () => {
    const result = createSchema.safeParse({ title: 'Quiz 1', concept: 'c1', questions: ['q1'] });
    expect(result.success).toBe(true);
  });

  it('rejects an unknown kind (UC-ASM-08..11)', () => {
    const result = createSchema.safeParse({
      title: 'Quiz 1',
      concept: 'c1',
      questions: ['q1'],
      kind: 'homework',
    });
    expect(result.success).toBe(false);
  });

  it('accepts a recognized kind', () => {
    const result = createSchema.safeParse({
      title: 'Quiz 1',
      concept: 'c1',
      questions: ['q1'],
      kind: 'mock_exam',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an update with no fields (UC-ACF-04)', () => {
    expect(updateSchema.safeParse({}).success).toBe(false);
  });

  it('rejects a rubric with no criteria (UC-ACF-08)', () => {
    expect(createRubricSchema.safeParse({ title: 'Essay rubric', concept: 'c1', criteria: [] }).success).toBe(
      false,
    );
  });

  it('accepts a rubric with at least 1 criterion', () => {
    const result = createRubricSchema.safeParse({
      title: 'Essay rubric',
      concept: 'c1',
      criteria: [{ name: 'Clarity', maxPoints: 10 }],
    });
    expect(result.success).toBe(true);
  });
});
