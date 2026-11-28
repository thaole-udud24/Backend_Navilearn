jest.mock('./lesson.model');
jest.mock('../knowledge/knowledge.model');
jest.mock('../question-bank/question-bank.model');
jest.mock('../knowledge/knowledge.service');

describe('lesson validation', () => {
  const { createSchema } = require('./lesson.validation');
  const cid = 'a'.repeat(24);

  it('accepts a minimal valid lesson', () => {
    expect(createSchema.safeParse({ title: 'Bài 1', concept: cid }).success).toBe(true);
  });

  it('rejects a lesson with no title or bad concept id', () => {
    expect(createSchema.safeParse({ title: '', concept: cid }).success).toBe(false);
    expect(createSchema.safeParse({ title: 'Bài 1', concept: 'x' }).success).toBe(false);
  });
});

describe('lesson service', () => {
  const LessonItem = require('./lesson.model');
  const Concept = require('../knowledge/knowledge.model');
  const QuestionItem = require('../question-bank/question-bank.model');
  const service = require('./lesson.service');
  const cid = 'a'.repeat(24);

  beforeEach(() => {
    jest.clearAllMocks();
    Concept.exists.mockResolvedValue(true);
  });

  it('create rejects a concept that does not exist', async () => {
    Concept.exists.mockResolvedValue(false);
    await expect(service.create('admin1', { title: 'T', concept: cid })).rejects.toMatchObject({
      status: 400,
      code: 'CONCEPT_NOT_FOUND',
    });
  });

  it('create rejects a question from a different concept', async () => {
    QuestionItem.find.mockResolvedValue([{ _id: 'q1', concept: 'other' }]);
    await expect(
      service.create('admin1', { title: 'T', concept: cid, questions: ['q1'] }),
    ).rejects.toMatchObject({ status: 400, code: 'QUESTION_CONCEPT_MISMATCH' });
  });

  it('create succeeds for a valid lesson', async () => {
    LessonItem.create.mockResolvedValue({ _id: 'l1' });
    await expect(service.create('admin1', { title: 'T', concept: cid })).resolves.toMatchObject({ _id: 'l1' });
  });

  it('publish sets status to published', async () => {
    const item = { status: 'draft', save: jest.fn().mockResolvedValue(undefined) };
    LessonItem.findById.mockReturnValue({ populate: () => item });
    await service.publish('l1', 'admin1');
    expect(item.status).toBe('published');
  });

  it('list filters by the whole concept subtree, not an exact match (picker reuse case)', async () => {
    const knowledgeService = require('../knowledge/knowledge.service');
    knowledgeService.getDescendantIds.mockResolvedValue([cid, 'leaf1', 'leaf2']);
    LessonItem.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ populate: () => [] }) }) }),
    });
    LessonItem.countDocuments.mockResolvedValue(0);

    await service.list({ concept: cid });

    expect(knowledgeService.getDescendantIds).toHaveBeenCalledWith(cid);
    expect(LessonItem.find).toHaveBeenCalledWith({ concept: { $in: [cid, 'leaf1', 'leaf2'] } });
  });
});
