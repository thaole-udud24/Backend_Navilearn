jest.mock('./plan-template.model');
jest.mock('../knowledge/knowledge.model');
jest.mock('../question-bank/question-bank.model');
jest.mock('../planning/planning.service');

describe('plan-template validation', () => {
  const { createSchema } = require('./plan-template.validation');

  it('accepts a template with 1-20 steps', () => {
    const r = createSchema.safeParse({
      title: 'Ôn thi',
      steps: [{ dayOffset: 1, durationMin: 30, title: 'Buổi 1' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an empty step list and an out-of-range dayOffset', () => {
    expect(createSchema.safeParse({ title: 'Ôn thi', steps: [] }).success).toBe(false);
    expect(
      createSchema.safeParse({
        title: 'Ôn thi',
        steps: [{ dayOffset: 99, durationMin: 30, title: 'Buổi 1' }],
      }).success,
    ).toBe(false);
  });

  it('rejects a step with no title', () => {
    const r = createSchema.safeParse({ title: 'Ôn thi', steps: [{ dayOffset: 1, durationMin: 30 }] });
    expect(r.success).toBe(false);
  });
});

describe('plan-template service', () => {
  const PlanTemplateItem = require('./plan-template.model');
  const Concept = require('../knowledge/knowledge.model');
  const QuestionItem = require('../question-bank/question-bank.model');
  const planningService = require('../planning/planning.service');
  const service = require('./plan-template.service');

  beforeEach(() => {
    jest.clearAllMocks();
    planningService.create.mockImplementation(async (owner, data) => ({ owner, ...data }));
    Concept.exists.mockResolvedValue(true);
  });

  it('listForRequester: student only sees published templates, admin sees everything', async () => {
    PlanTemplateItem.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ populate: () => [] }) }) }),
    });
    PlanTemplateItem.countDocuments.mockResolvedValue(0);

    await service.listForRequester({ role: 'student' }, {});
    expect(PlanTemplateItem.find).toHaveBeenCalledWith({ status: 'published' });

    await service.listForRequester({ role: 'admin' }, {});
    expect(PlanTemplateItem.find).toHaveBeenCalledWith({});
  });

  it('listForRequester: filters by concept when given, for either role', async () => {
    PlanTemplateItem.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ populate: () => [] }) }) }),
    });
    PlanTemplateItem.countDocuments.mockResolvedValue(0);

    await service.listForRequester({ role: 'student' }, { concept: 'c1' });
    expect(PlanTemplateItem.find).toHaveBeenCalledWith({ status: 'published', concept: 'c1' });
  });

  it('create rejects a template whose concept does not exist', async () => {
    Concept.exists.mockResolvedValue(false);
    await expect(
      service.create('admin1', { title: 'T', concept: 'c1', steps: [{ dayOffset: 1, durationMin: 30 }] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it('create rejects a step question id that does not exist', async () => {
    QuestionItem.find.mockResolvedValue([]);
    await expect(
      service.create('admin1', {
        title: 'T',
        concept: 'c1',
        steps: [{ dayOffset: 1, durationMin: 30, questions: ['q-missing'] }],
      }),
    ).rejects.toMatchObject({ status: 400, code: 'QUESTION_NOT_FOUND' });
  });

  it('create rejects a step question that belongs to a different concept', async () => {
    QuestionItem.find.mockResolvedValue([{ _id: 'q1', concept: 'c-other' }]);
    await expect(
      service.create('admin1', {
        title: 'T',
        concept: 'c1',
        steps: [{ dayOffset: 1, durationMin: 30, questions: ['q1'] }],
      }),
    ).rejects.toMatchObject({ status: 400, code: 'QUESTION_CONCEPT_MISMATCH' });
  });

  it('create accepts a step question that belongs to the template concept', async () => {
    QuestionItem.find.mockResolvedValue([{ _id: 'q1', concept: 'c1' }]);
    PlanTemplateItem.create.mockResolvedValue({ _id: 't1' });
    await expect(
      service.create('admin1', {
        title: 'T',
        concept: 'c1',
        steps: [{ dayOffset: 1, durationMin: 30, questions: ['q1'] }],
      }),
    ).resolves.toMatchObject({ _id: 't1' });
  });

  it('apply: uses the template concept when no goal is given, builds dayOffset dates', async () => {
    PlanTemplateItem.findById.mockReturnValue({
      populate: () => ({
        _id: 't1',
        title: 'Ôn tập',
        status: 'published',
        concept: 'c1',
        steps: [{ dayOffset: 2, durationMin: 30, note: 'Đọc bài' }],
      }),
    });
    const plan = await service.apply('u1', 't1');
    expect(planningService.create).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ status: 'proposed', title: 'Ôn tập (từ lộ trình mẫu)' }),
    );
    expect(plan.sessions).toEqual([
      expect.objectContaining({ concept: 'c1', durationMin: 30, note: 'Đọc bài' }),
    ]);
  });

  it('apply: prefers the goal concept over the template concept when a goal is given', async () => {
    PlanTemplateItem.findById.mockReturnValue({
      populate: () => ({
        _id: 't1',
        title: 'Ôn tập',
        status: 'published',
        concept: 'c1',
        steps: [{ dayOffset: 1, durationMin: 20 }],
      }),
    });
    planningService.getOwnedGoal.mockResolvedValue({ concept: 'c2' });
    const plan = await service.apply('u1', 't1', 'g1');
    expect(plan.sessions[0].concept).toBe('c2');
  });

  it('apply: rejects a concept-less template applied without a goal', async () => {
    PlanTemplateItem.findById.mockReturnValue({
      populate: () => ({
        _id: 't1',
        title: 'Ôn tập',
        status: 'published',
        concept: null,
        steps: [{ dayOffset: 1, durationMin: 20 }],
      }),
    });
    await expect(service.apply('u1', 't1')).rejects.toMatchObject({ status: 400 });
  });

  it('apply: rejects a draft template', async () => {
    PlanTemplateItem.findById.mockReturnValue({
      populate: () => ({
        _id: 't1',
        title: 'Ôn tập',
        status: 'draft',
        concept: 'c1',
        steps: [{ dayOffset: 1, durationMin: 20 }],
      }),
    });
    await expect(service.apply('u1', 't1')).rejects.toMatchObject({ status: 409 });
  });

  it('publish: sets status/publishedAt/changeLog and bumps version on re-publish', async () => {
    const item = { status: 'draft', version: 1, save: jest.fn().mockResolvedValue(undefined) };
    PlanTemplateItem.findById.mockReturnValue({ populate: () => item });
    await service.publish('t1', 'admin1', 'initial release');
    expect(item.status).toBe('published');
    expect(item.version).toBe(1);
    expect(item.changeLog).toBe('initial release');

    item.status = 'published';
    await service.publish('t1', 'admin1', 'second release');
    expect(item.version).toBe(2);
  });

  it('archive: sets status to archived', async () => {
    const item = { status: 'published', save: jest.fn().mockResolvedValue(undefined) };
    PlanTemplateItem.findById.mockReturnValue({ populate: () => item });
    await service.archive('t1', 'admin1');
    expect(item.status).toBe('archived');
  });
});
