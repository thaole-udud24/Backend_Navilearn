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
jest.mock('../question-bank/question-bank.model');

describe('planning validation', () => {
  const { createSchema } = require('./planning.validation');
  const cid = 'a'.repeat(24);

  it('accepts a plan with a valid session and defaults sessions to []', () => {
    expect(createSchema.parse({ title: 'Week 1' }).sessions).toEqual([]);
    const r = createSchema.safeParse({
      title: 'W',
      sessions: [{ concept: cid, startAt: '2026-11-10T08:00:00Z', durationMin: 45 }],
    });
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
    expect(
      goalSchema.safeParse({ concept: cid, title: 'G', deadline: '2999-01-01', importance: 4 }).success,
    ).toBe(true);
  });

  it('rejects a past deadline and importance out of 1-5', () => {
    expect(goalSchema.safeParse({ concept: cid, title: 'G', deadline: '2000-01-01' }).success).toBe(false);
    expect(
      goalSchema.safeParse({ concept: cid, title: 'G', deadline: '2999-01-01', importance: 6 }).success,
    ).toBe(false);
  });

  it('update needs at least one field', () => {
    expect(updateGoalSchema.safeParse({}).success).toBe(false);
    expect(updateGoalSchema.safeParse({ importance: 2 }).success).toBe(true);
  });

  it('forbids updating a goal of another student', async () => {
    Goal.findById.mockResolvedValue({ owner: 'u1' });
    await expect(service.updateGoal('g1', { id: 'u2' }, { importance: 2 })).rejects.toMatchObject({
      status: 403,
    });
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
  const activePlan = () => ({
    owner: 'u1',
    status: 'active',
    sessions: [{ _id: 's1', status: 'planned' }],
    save: jest.fn(),
  });

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
    await expect(service.updateSession('p1', 'nope', owner, { status: 'done' })).rejects.toMatchObject({
      status: 404,
    });
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
  describe('session lifecycle (UC-PLN-03..07)', () => {
    const at = (h) => new Date(`2026-11-20T${h}:00Z`);
    const planWith = (...sessions) => ({ owner: 'u1', status: 'active', sessions, save: jest.fn() });
    const s = (id, h, status = 'planned') => ({ _id: id, startAt: at(h), durationMin: 60, status });

    it('rejects a new session that overlaps, ignores cancelled ones', async () => {
      Plan.findById.mockResolvedValue(planWith(s('s1', '08:00'), s('s2', '10:00', 'cancelled')));
      await expect(
        service.addSession('p1', owner, { concept: 'c', startAt: at('08:30'), durationMin: 30 }),
      ).rejects.toMatchObject({ status: 409 });
      await expect(
        service.addSession('p1', owner, { concept: 'c', startAt: at('10:00'), durationMin: 30 }),
      ).resolves.toBeDefined();
    });

    it('allows back-to-back sessions and moving a session onto its own slot', async () => {
      const plan = planWith(s('s1', '08:00'));
      Plan.findById.mockResolvedValue(plan);
      await service.addSession('p1', owner, { concept: 'c', startAt: at('09:00'), durationMin: 30 });
      await expect(service.updateSession('p1', 's1', owner, { durationMin: 45 })).resolves.toBeDefined();
    });

    it('reschedule rejects overlap; only a planned session can be moved, cancelled or completed', async () => {
      Plan.findById.mockResolvedValue(planWith(s('s1', '08:00'), s('s2', '09:00'), s('s3', '12:00', 'done')));
      await expect(service.updateSession('p1', 's2', owner, { startAt: at('08:30') })).rejects.toMatchObject({
        status: 409,
      });
      await expect(service.updateSession('p1', 's3', owner, { status: 'cancelled' })).rejects.toMatchObject({
        status: 409,
      });
      await expect(service.updateSession('p1', 's3', owner, { startAt: at('13:00') })).rejects.toMatchObject({
        status: 409,
      });
    });

    it('cancel keeps the session as status cancelled', async () => {
      const plan = planWith(s('s1', '08:00'));
      Plan.findById.mockResolvedValue(plan);
      await service.updateSession('p1', 's1', owner, { status: 'cancelled' });
      expect(plan.sessions[0].status).toBe('cancelled');
    });

    it('note needs a done session, or completion in the same request', async () => {
      Plan.findById.mockResolvedValue(planWith(s('s1', '08:00')));
      await expect(service.updateSession('p1', 's1', owner, { note: 'x' })).rejects.toMatchObject({
        status: 409,
      });
      const plan = planWith(s('s1', '08:00'), s('s2', '10:00', 'done'));
      Plan.findById.mockResolvedValue(plan);
      await service.updateSession('p1', 's1', owner, { status: 'done', note: 'ok' });
      await service.updateSession('p1', 's2', owner, { note: 'hard part: joins' });
      expect(plan.sessions.map((x) => x.note)).toEqual(['ok', 'hard part: joins']);
    });

    it('validation: system-only statuses are not accepted from the client', () => {
      expect(updateSessionSchema.safeParse({ status: 'missed' }).success).toBe(false);
      expect(updateSessionSchema.safeParse({ note: 'x' }).success).toBe(true);
    });
  });

  describe('session quiz gate (UC-PLN-TPL-03)', () => {
    const QuestionItem = require('../question-bank/question-bank.model');
    const planWithQuiz = (quizPassed = false) => ({
      owner: 'u1',
      status: 'active',
      sessions: [{ _id: 's1', status: 'planned', questions: ['q1', 'q2'], quizPassed }],
      save: jest.fn(),
    });

    it('rejects marking done when the attached quiz has not been passed', async () => {
      Plan.findById.mockResolvedValue(planWithQuiz(false));
      await expect(service.updateSession('p1', 's1', owner, { status: 'done' })).rejects.toMatchObject({
        status: 409,
      });
    });

    it('allows marking done once the quiz is passed', async () => {
      const plan = planWithQuiz(true);
      Plan.findById.mockResolvedValue(plan);
      await service.updateSession('p1', 's1', owner, { status: 'done' });
      expect(plan.sessions[0].status).toBe('done');
    });

    it('submitSessionQuiz grades answers and only sets quizPassed at/above 70%', async () => {
      QuestionItem.find.mockResolvedValue([
        { _id: 'q1', options: [{ text: 'a', isCorrect: true }, { text: 'b' }] },
        { _id: 'q2', options: [{ text: 'a', isCorrect: true }, { text: 'b' }] },
      ]);
      const failPlan = planWithQuiz(false);
      Plan.findById.mockResolvedValue(failPlan);
      const fail = await service.submitSessionQuiz('p1', 's1', owner, [
        { questionId: 'q1', selectedOptionIndex: 1 },
        { questionId: 'q2', selectedOptionIndex: 1 },
      ]);
      expect(fail).toEqual({ scorePercent: 0, passed: false, correctCount: 0, totalCount: 2 });
      expect(failPlan.sessions[0].quizPassed).toBe(false);

      const passPlan = planWithQuiz(false);
      Plan.findById.mockResolvedValue(passPlan);
      const pass = await service.submitSessionQuiz('p1', 's1', owner, [
        { questionId: 'q1', selectedOptionIndex: 0 },
        { questionId: 'q2', selectedOptionIndex: 0 },
      ]);
      expect(pass).toEqual({ scorePercent: 100, passed: true, correctCount: 2, totalCount: 2 });
      expect(passPlan.sessions[0].quizPassed).toBe(true);
    });

    it('rejects submitting a quiz for a session with no attached questions', async () => {
      Plan.findById.mockResolvedValue({
        owner: 'u1',
        status: 'active',
        sessions: [{ _id: 's1', status: 'planned', questions: [] }],
        save: jest.fn(),
      });
      await expect(
        service.submitSessionQuiz('p1', 's1', owner, [{ questionId: 'q1', selectedOptionIndex: 0 }]),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  describe('sessions view (UC-PLN-01/02)', () => {
    const { sessionsQuerySchema } = require('./planning.validation');
    const now = new Date('2026-11-20T00:00:00Z');
    const at = (d) => new Date(`2026-11-${d}T08:00:00Z`);
    const mk = (id, d, status) => ({ _id: id, concept: 'c', startAt: at(d), durationMin: 30, status });
    const plan = { _id: 'p1', title: 'W1', sessions: [mk('s1', '25', 'planned'), mk('s2', '18', 'planned'), mk('s3', '15', 'done'), mk('s4', '22', 'cancelled')] };

    beforeEach(() => Plan.find.mockResolvedValue([plan]));

    it('lists sessions sorted by start; a past planned session shows as missed', async () => {
      const r = await service.listSessions('u1', {}, now);
      expect(r.map((x) => [x.id, x.status])).toEqual([['s3', 'done'], ['s2', 'missed'], ['s4', 'cancelled'], ['s1', 'planned']]);
      expect(Plan.find).toHaveBeenCalledWith({ owner: 'u1', status: 'active' });
    });

    it('filters by window (to exclusive) and by status', async () => {
      const win = await service.listSessions('u1', { from: at('18'), to: at('25') }, now);
      expect(win.map((x) => x.id)).toEqual(['s2', 's4']);
      const hist = await service.listSessions('u1', { status: 'missed' }, now);
      expect(hist.map((x) => x.id)).toEqual(['s2']);
    });

    it('validation: coerces dates, rejects from >= to and unknown status', () => {
      expect(sessionsQuerySchema.parse({ from: '2026-11-16', to: '2026-11-23' }).from).toBeInstanceOf(Date);
      expect(sessionsQuerySchema.safeParse({ from: '2026-11-23', to: '2026-11-16' }).success).toBe(false);
      expect(sessionsQuerySchema.safeParse({ status: 'skipped' }).success).toBe(false);
      expect(sessionsQuerySchema.safeParse({}).success).toBe(true);
    });
  });
});
