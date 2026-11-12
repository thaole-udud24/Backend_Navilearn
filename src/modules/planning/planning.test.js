const { parsePagination } = require('../../utils/pagination');

describe('planning module', () => {
  it('parsePagination defaults page=1 limit=20', () => {
    const { page, limit, skip } = parsePagination({});
    expect(page).toBe(1);
    expect(limit).toBe(20);
    expect(skip).toBe(0);
  });

  it('parsePagination caps limit at 100', () => {
    const { limit } = parsePagination({ limit: '500' });
    expect(limit).toBe(100);
  });
});
jest.mock('./planning.model');
jest.mock('./planning.goal.model');

describe('planning validation', () => {
  const { createSchema } = require('./planning.validation');
  const cid = 'a'.repeat(24);

  it('accepts a plan with a valid session and defaults sessions to []', () => {
    expect(createSchema.parse({ title: 'Week 1' }).sessions).toEqual([]);
    const r = createSchema.safeParse({ title: 'W', sessions: [{ concept: cid, startAt: '2026-11-10T08:00:00Z', durationMin: 45 }] });
    expect(r.success).toBe(true);
  });

  it('rejects bad concept id and out-of-range duration', () => {
    const bad = (s) => createSchema.safeParse({ title: 'W', sessions: [s] }).success;
    expect(bad({ concept: 'x', startAt: '2026-11-10', durationMin: 45 })).toBe(false);
    expect(bad({ concept: cid, startAt: '2026-11-10', durationMin: 1 })).toBe(false);
  });
});

describe('planning service (BR-02/35, BR-37/54)', () => {
  const Plan = require('./planning.model');
  const service = require('./planning.service');

  it('forbids a non-owner', async () => {
    Plan.findById.mockResolvedValue({ owner: 'u1' });
    await expect(service.getOwned('p1', { id: 'u2' })).rejects.toMatchObject({ status: 403 });
  });

  it('confirm turns proposed into active', async () => {
    const plan = { owner: 'u1', status: 'proposed', save: jest.fn() };
    Plan.findById.mockResolvedValue(plan);
    await service.confirm('p1', { id: 'u1' });
    expect(plan.status).toBe('active');
    expect(plan.save).toHaveBeenCalled();
  });

  it('confirm supersedes the plan it replaces', async () => {
    Plan.findById.mockResolvedValue({ owner: 'u1', status: 'proposed', replaces: 'p0', save: jest.fn() });
    await service.confirm('p1', { id: 'u1' });
    expect(Plan.updateOne).toHaveBeenCalledWith({ _id: 'p0', owner: 'u1' }, { status: 'superseded' });
  });

  it('confirm rejects a plan that is not proposed', async () => {
    Plan.findById.mockResolvedValue({ owner: 'u1', status: 'active' });
    await expect(service.confirm('p1', { id: 'u1' })).rejects.toMatchObject({ status: 409 });
  });
});

describe('planning goals (PLN-03)', () => {
  const { goalSchema, updateGoalSchema } = require('./planning.validation');
  const Goal = require('./planning.goal.model');
  const service = require('./planning.service');
  const cid = 'a'.repeat(24);

  it('accepts a goal with a future deadline', () => {
    expect(goalSchema.safeParse({ concept: cid, title: 'G', deadline: '2999-01-01', importance: 4 }).success).toBe(true);
  });

  it('rejects a past deadline and importance out of 1-5', () => {
    expect(goalSchema.safeParse({ concept: cid, title: 'G', deadline: '2000-01-01' }).success).toBe(false);
    expect(goalSchema.safeParse({ concept: cid, title: 'G', deadline: '2999-01-01', importance: 6 }).success).toBe(false);
  });

  it('update needs at least one field', () => {
    expect(updateGoalSchema.safeParse({}).success).toBe(false);
    expect(updateGoalSchema.safeParse({ importance: 2 }).success).toBe(true);
  });

  it('forbids updating a goal of another student', async () => {
    Goal.findById.mockResolvedValue({ owner: 'u1' });
    await expect(service.updateGoal('g1', { id: 'u2' }, { importance: 2 })).rejects.toMatchObject({ status: 403 });
  });

  it('owner update saves the new fields', async () => {
    const goal = { owner: 'u1', importance: 3, save: jest.fn() };
    Goal.findById.mockResolvedValue(goal);
    await service.updateGoal('g1', { id: 'u1' }, { importance: 5 });
    expect(goal.importance).toBe(5);
    expect(goal.save).toHaveBeenCalled();
  });
});
describe('planning sessions (PLN-02)', () => {
  const { updateSessionSchema } = require('./planning.validation');
  const Plan = require('./planning.model');
  const service = require('./planning.service');
  const owner = { id: 'u1' };
  const activePlan = () => ({ owner: 'u1', status: 'active', sessions: [{ _id: 's1', status: 'planned' }], save: jest.fn() });

  it('update validation: needs a field and only allows known statuses', () => {
    expect(updateSessionSchema.safeParse({}).success).toBe(false);
    expect(updateSessionSchema.safeParse({ status: 'done' }).success).toBe(true);
    expect(updateSessionSchema.safeParse({ status: 'skipped' }).success).toBe(false);
  });

  it('adds a session to an active plan', async () => {
    const plan = activePlan();
    Plan.findById.mockResolvedValue(plan);
    await service.addSession('p1', owner, { concept: 'c1', startAt: new Date(), durationMin: 30 });
    expect(plan.sessions).toHaveLength(2);
    expect(plan.save).toHaveBeenCalled();
  });

  it('marks a session done', async () => {
    const plan = activePlan();
    Plan.findById.mockResolvedValue(plan);
    await service.updateSession('p1', 's1', owner, { status: 'done' });
    expect(plan.sessions[0].status).toBe('done');
  });

  it('404 for an unknown session, 409 for a plan that is not active', async () => {
    Plan.findById.mockResolvedValue(activePlan());
    await expect(service.updateSession('p1', 'nope', owner, { status: 'done' })).rejects.toMatchObject({ status: 404 });
    Plan.findById.mockResolvedValue({ ...activePlan(), status: 'proposed' });
    await expect(service.removeSession('p1', 's1', owner)).rejects.toMatchObject({ status: 409 });
  });

  it('removes a session', async () => {
    const plan = activePlan();
    Plan.findById.mockResolvedValue(plan);
    await service.removeSession('p1', 's1', owner);
    expect(plan.sessions).toHaveLength(0);
    expect(plan.save).toHaveBeenCalled();
  });
});