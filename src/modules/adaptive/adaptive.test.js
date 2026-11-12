const { parsePagination } = require('../../utils/pagination');

describe('adaptive module', () => {
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

describe('adaptive priority (BR-40)', () => {
  const { WEIGHTS, computePriority, rankActivities } = require('./adaptive.priority');
  const full = { mastery: 0, importance: 1, prerequisite: 1, deadline: 1, forgetting: 1, timeFit: 1 };
  const none = { mastery: 100, importance: 0, prerequisite: 0, deadline: 0, forgetting: 0, timeFit: 0 };

  it('weights sum to 1', () => {
    expect(Object.values(WEIGHTS).reduce((s, x) => s + x, 0)).toBeCloseTo(1);
  });

  it('max inputs give 1, min inputs give 0', () => {
    expect(computePriority(full)).toBeCloseTo(1);
    expect(computePriority(none)).toBeCloseTo(0);
  });

  it('matches the BR-40 formula on a mixed case', () => {
    const a = { mastery: 40, importance: 0.5, prerequisite: 1, deadline: 0.8, forgetting: 0.2, timeFit: 1 };
    // 0.3*0.6 + 0.2*0.5 + 0.15*1 + 0.2*0.8 + 0.1*0.2 + 0.05*1 = 0.66
    expect(computePriority(a)).toBeCloseTo(0.66);
  });

  it('ranks highest priority first', () => {
    const r = rankActivities([{ id: 'low', ...none }, { id: 'high', ...full }]);
    expect(r.map((x) => x.id)).toEqual(['high', 'low']);
  });
});
jest.mock('../mastery/mastery.service');
jest.mock('../planning/planning.service');
jest.mock('./adaptive.model');

describe('next best action (AP-ADP-01)', () => {
  const { buildActivity, explain } = require('./adaptive.priority');
  const masteryService = require('../mastery/mastery.service');
  const planningService = require('../planning/planning.service');
  const service = require('./adaptive.service');
  const now = new Date('2026-11-10T00:00:00Z');
  const inDays = (d) => new Date(now.getTime() + d * 86400000);

  it('buildActivity: no data gives neutral defaults', () => {
    expect(buildActivity({ id: 'c', name: 'C' }, now)).toMatchObject({ mastery: 0, importance: 0.6, deadline: 0, forgetting: 0 });
  });

  it('buildActivity: deadline urgency and forgetting scale with days', () => {
    const a = buildActivity({ id: 'c', mastery: { score: 50, lastAttemptAt: inDays(-7) }, goal: { importance: 5, deadline: inDays(3) } }, now);
    expect(a.deadline).toBeCloseTo(0.9);
    expect(a.forgetting).toBeCloseTo(0.5);
    expect(a.importance).toBe(1);
  });

  it('explain names the biggest contributor', () => {
    const base = { mastery: 100, importance: 0, prerequisite: 0, deadline: 0, forgetting: 0, timeFit: 0 };
    expect(explain({ ...base, mastery: 10 })).toMatch(/thành thạo/);
    expect(explain({ ...base, deadline: 1 })).toMatch(/hạn/);
  });

  it('picks the concept with the nearest goal over a well-known one', async () => {
    masteryService.listForOwner.mockResolvedValue({ items: [{ concept: { _id: 'c1', name: 'A' }, score: 90, lastAttemptAt: now }] });
    planningService.listGoals.mockResolvedValue({ items: [{ concept: { _id: 'c2', name: 'B' }, importance: 5, deadline: inDays(2) }] });
    const r = await service.nextBestAction('u1', now);
    expect(r.concept).toEqual({ id: 'c2', name: 'B' });
    expect(r.reason).toBeTruthy();
  });

  it('returns null when the student has no mastery and no goals', async () => {
    masteryService.listForOwner.mockResolvedValue({ items: [] });
    planningService.listGoals.mockResolvedValue({ items: [] });
    expect(await service.nextBestAction('u1', now)).toBeNull();
  });
});
describe('replan (AP-ADP-03)', () => {
  const masteryService = require('../mastery/mastery.service');
  const planningService = require('../planning/planning.service');
  const service = require('./adaptive.service');
  const now = new Date('2026-11-10T00:00:00Z');
  const at = (iso) => new Date(iso);
  const plan = (sessions, status = 'active') => ({ _id: 'p1', title: 'W1', status, sessions });

  beforeEach(() => {
    masteryService.listForOwner.mockResolvedValue({
      items: [
        { concept: { _id: 'c1', name: 'A' }, score: 90, lastAttemptAt: now },
        { concept: { _id: 'c2', name: 'B' }, score: 10, lastAttemptAt: now },
      ],
    });
    planningService.listGoals.mockResolvedValue({ items: [] });
    planningService.create.mockImplementation(async (_owner, data) => data);
  });

  it('rejects a plan that is not active or has nothing missed', async () => {
    planningService.getOwned.mockResolvedValue(plan([], 'proposed'));
    await expect(service.replan('u1', 'p1', now)).rejects.toMatchObject({ status: 409 });
    planningService.getOwned.mockResolvedValue(plan([{ concept: 'c1', startAt: at('2026-11-12T08:00:00Z'), durationMin: 30, status: 'planned' }]));
    await expect(service.replan('u1', 'p1', now)).rejects.toMatchObject({ status: 409 });
  });

  it('proposes a plan that puts the weaker concept first, one session per day from tomorrow', async () => {
    planningService.getOwned.mockResolvedValue(
      plan([
        { concept: 'c1', startAt: at('2026-11-09T08:00:00Z'), durationMin: 30, status: 'planned' },
        { concept: 'c2', startAt: at('2026-11-12T09:30:00Z'), durationMin: 45, status: 'planned' },
        { concept: 'c1', startAt: at('2026-11-08T08:00:00Z'), durationMin: 30, status: 'done' },
      ]),
    );
    const { plan: proposed, reason } = await service.replan('u1', 'p1', now);
    expect(proposed.status).toBe('proposed');
    expect(proposed.replaces).toBe('p1');
    expect(proposed.sessions.map((s) => s.concept)).toEqual(['c2', 'c1']);
    expect(proposed.sessions.map((s) => s.startAt.toISOString())).toEqual(['2026-11-11T09:30:00.000Z', '2026-11-12T08:00:00.000Z']);
    expect(reason).toBeTruthy();
  });
});

describe('start activity (UC-ADP-02)', () => {
  const masteryService = require('../mastery/mastery.service');
  const planningService = require('../planning/planning.service');
  const Activity = require('./adaptive.model');
  const service = require('./adaptive.service');
  const now = new Date('2026-11-10T00:00:00Z');

  beforeEach(() => {
    planningService.listGoals.mockResolvedValue({ items: [] });
    Activity.create.mockImplementation(async (data) => data);
  });

  it('records the current recommendation as a started activity', async () => {
    masteryService.listForOwner.mockResolvedValue({ items: [{ concept: { _id: 'c2', name: 'B' }, score: 10, lastAttemptAt: now }] });
    const r = await service.startNextBestAction('u1', now);
    expect(Activity.create).toHaveBeenCalledWith(expect.objectContaining({ owner: 'u1', concept: 'c2' }));
    expect(r.concept).toEqual({ id: 'c2', name: 'B' });
  });

  it('409 and no record when there is no recommendation', async () => {
    Activity.create.mockClear();
    masteryService.listForOwner.mockResolvedValue({ items: [] });
    await expect(service.startNextBestAction('u1', now)).rejects.toMatchObject({ status: 409 });
    expect(Activity.create).not.toHaveBeenCalled();
  });
});

describe('replan check (AP-ADP-02)', () => {
  const planningService = require('../planning/planning.service');
  const service = require('./adaptive.service');
  const now = new Date('2026-11-10T00:00:00Z');
  const session = (iso, status = 'planned') => ({ concept: 'c1', startAt: new Date(iso), durationMin: 30, status });
  const plan = (sessions, status = 'active') => ({ _id: 'p1', title: 'W1', status, sessions });

  it('needs replanning when a planned session is already in the past', async () => {
    planningService.getOwned.mockResolvedValue(plan([session('2026-11-09T08:00:00Z'), session('2026-11-12T08:00:00Z')]));
    expect(await service.checkReplan('u1', 'p1', now)).toEqual({ needed: true, missedCount: 1 });
  });

  it('counts sessions marked missed, ignores done and future ones', async () => {
    planningService.getOwned.mockResolvedValue(
      plan([session('2026-11-12T08:00:00Z', 'missed'), session('2026-11-08T08:00:00Z', 'done'), session('2026-11-13T08:00:00Z')]),
    );
    expect(await service.checkReplan('u1', 'p1', now)).toEqual({ needed: true, missedCount: 1 });
  });

  it('no replan needed when nothing is missed; 409 when the plan is not active', async () => {
    planningService.getOwned.mockResolvedValue(plan([session('2026-11-12T08:00:00Z')]));
    expect(await service.checkReplan('u1', 'p1', now)).toEqual({ needed: false, missedCount: 0 });
    planningService.getOwned.mockResolvedValue(plan([], 'proposed'));
    await expect(service.checkReplan('u1', 'p1', now)).rejects.toMatchObject({ status: 409 });
  });
});