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

jest.mock('./assessment-config.model', () => ({ find: jest.fn(), countDocuments: jest.fn(), create: jest.fn() }));
jest.mock('./rubric.model', () => ({ find: jest.fn(), countDocuments: jest.fn() }));
jest.mock('../knowledge/knowledge.model', () => ({ findById: jest.fn() }));
jest.mock('../question-bank/question-bank.model', () => ({ find: jest.fn() }));

describe('assessment-config list() status filter (security)', () => {
  const AssessmentConfigItem = require('./assessment-config.model');
  const { list } = require('./assessment-config.service');

  beforeEach(() => {
    AssessmentConfigItem.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => [] }) }) });
    AssessmentConfigItem.countDocuments.mockResolvedValue(0);
  });

  it('forces status=active for a student even if they ask for a different status', async () => {
    await list({ status: 'archived' }, { role: 'student' });
    expect(AssessmentConfigItem.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });

  it('lets an admin request a specific status', async () => {
    await list({ status: 'archived' }, { role: 'admin' });
    expect(AssessmentConfigItem.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'archived' }));
  });
});

describe('assessment-config listRubrics() status filter (security)', () => {
  const Rubric = require('./rubric.model');
  const { listRubrics } = require('./assessment-config.service');

  beforeEach(() => {
    Rubric.find.mockReturnValue({ sort: () => ({ skip: () => ({ limit: () => [] }) }) });
    Rubric.countDocuments.mockResolvedValue(0);
  });

  it('forces status=active for a student even if they ask for a different status', async () => {
    await listRubrics({ status: 'draft' }, { role: 'student' });
    expect(Rubric.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'active' }));
  });

  it('lets an admin request a specific status', async () => {
    await listRubrics({ status: 'draft' }, { role: 'admin' });
    expect(Rubric.find).toHaveBeenCalledWith(expect.objectContaining({ status: 'draft' }));
  });
});

describe('assessment-config create() duplicate question ids', () => {
  const AssessmentConfigItem = require('./assessment-config.model');
  const Concept = require('../knowledge/knowledge.model');
  const QuestionItem = require('../question-bank/question-bank.model');
  const { create } = require('./assessment-config.service');

  it('does not reject a duplicate question id as not-found', async () => {
    Concept.findById.mockResolvedValue({ _id: 'c1' });
    QuestionItem.find.mockResolvedValue([{ _id: 'q1', concept: 'c1' }]);
    AssessmentConfigItem.create.mockResolvedValue({});

    await expect(create('owner1', { concept: 'c1', questions: ['q1', 'q1'] })).resolves.toBeDefined();
  });
});
