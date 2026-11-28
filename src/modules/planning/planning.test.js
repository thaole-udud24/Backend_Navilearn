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
jest.mock('../asset/asset.model');
jest.mock('../knowledge/knowledge.service');

// planning.goal.model's date-math statics (dateOnly/deriveStudyDays) are pure helpers the service
// layer reuses (applyDerivedStudyDays/checkGoalOverlap) — keep their REAL implementation even though
// the rest of the model (find/create/etc.) stays auto-mocked.
{
  const PlanningGoalModel = require('./planning.goal.model');
  const real = jest.requireActual('./planning.goal.model');
  PlanningGoalModel.dateOnly.mockImplementation(real.dateOnly);
  PlanningGoalModel.deriveStudyDays.mockImplementation(real.deriveStudyDays);
}

describe('planning validation', () => {
  const { createSchema } = require('./planning.validation');
  const cid = 'a'.repeat(24);

  it('accepts a plan with a valid session and defaults sessions to []', () => {
    expect(createSchema.parse({ title: 'Week 1' }).sessions).toEqual([]);
    const r = createSchema.safeParse({
      title: 'W',
      sessions: [{ concept: cid, startAt: '2026-11-10T08:00:00Z', durationMin: 45, title: 'Buổi 1' }],
    });
    expect(r.success).toBe(true);
  });

  it('rejects bad concept id and out-of-range duration', () => {
    const bad = (s) => createSchema.safeParse({ title: 'W', sessions: [s] }).success;
    expect(bad({ concept: 'x', startAt: '2026-11-10', durationMin: 45, title: 'Buổi 1' })).toBe(false);
    expect(bad({ concept: cid, startAt: '2026-11-10', durationMin: 1, title: 'Buổi 1' })).toBe(false);
  });

  it('rejects a session with no title', () => {
    const r = createSchema.safeParse({
      title: 'W',
      sessions: [{ concept: cid, startAt: '2026-11-10T08:00:00Z', durationMin: 45 }],
    });
    expect(r.success).toBe(false);
  });
});

describe('planning Plan↔Goal link (create)', () => {
  const Plan = require('./planning.model');
  const Goal = require('./planning.goal.model');
  const service = require('./planning.service');

  afterEach(() => jest.clearAllMocks());

  it('a raw goalId is verified owned, then stored as the plan goal', async () => {
    Goal.findById.mockResolvedValue({ owner: 'u1' });
    Plan.create.mockResolvedValue({ title: 'T', goal: 'g1' });
    await service.create('u1', { title: 'T', goalId: 'g1' });
    expect(Plan.create).toHaveBeenCalledWith(expect.objectContaining({ goal: 'g1' }));
  });

  it('rejects a goalId that belongs to another student', async () => {
    Goal.findById.mockResolvedValue({ owner: 'u2' });
    await expect(service.create('u1', { title: 'T', goalId: 'g1' })).rejects.toMatchObject({ status: 403 });
    expect(Plan.create).not.toHaveBeenCalled();
  });

  it('trusts an already-resolved goal field from internal callers (template/AI/replan) without re-checking', async () => {
    Plan.create.mockResolvedValue({ title: 'T', goal: 'g9' });
    await service.create('u1', { title: 'T', goal: 'g9' });
    expect(Plan.create).toHaveBeenCalledWith(expect.objectContaining({ goal: 'g9' }));
    expect(Goal.findById).not.toHaveBeenCalled();
  });

  it('defaults goal to null when neither goalId nor goal is given', async () => {
    Plan.create.mockResolvedValue({ title: 'T', goal: null });
    await service.create('u1', { title: 'T' });
    expect(Plan.create).toHaveBeenCalledWith(expect.objectContaining({ goal: null }));
  });
});

describe('planning real coverage % (computeCoverage, Fix 3)', () => {
  const Goal = require('./planning.goal.model');
  const knowledgeService = require('../knowledge/knowledge.service');
  const service = require('./planning.service');

  afterEach(() => jest.clearAllMocks());

  it('returns null when the plan has no goal link (legacy plan)', async () => {
    expect(await service.computeCoverage({ goal: null, sessions: [] })).toBeNull();
  });

  it('returns null when the goal has no concept', async () => {
    Goal.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ concept: null }) }) });
    expect(await service.computeCoverage({ goal: 'g1', sessions: [] })).toBeNull();
  });

  it('returns null when the subject has no recorded leaf concepts (no knowledge tree)', async () => {
    Goal.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ concept: 'subj1' }) }) });
    knowledgeService.getDescendantLeafIds.mockResolvedValue([]);
    expect(await service.computeCoverage({ goal: 'g1', sessions: [{ concept: 'subj1' }] })).toBeNull();
  });

  it('counts only sessions whose concept is a real leaf of the subject, never the root', async () => {
    Goal.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ concept: 'subj1' }) }) });
    knowledgeService.getDescendantLeafIds.mockResolvedValue(['leaf1', 'leaf2', 'leaf3']);
    const coverage = await service.computeCoverage({
      goal: 'g1',
      sessions: [
        { concept: 'leaf1' },
        { concept: 'leaf1' }, // duplicate leaf -> still counts once
        { concept: 'subj1' }, // root concept (ad-hoc/untagged session) -> does NOT count
      ],
    });
    expect(coverage).toEqual({ coveredLeafCount: 1, totalLeafCount: 3, percent: 33 });
  });

  it('a subject with no subtree (goal concept itself is the only leaf) can legitimately reach 100%', async () => {
    Goal.findById.mockReturnValue({ select: () => ({ lean: () => Promise.resolve({ concept: 'leafOnly' }) }) });
    knowledgeService.getDescendantLeafIds.mockResolvedValue(['leafOnly']);
    const coverage = await service.computeCoverage({ goal: 'g1', sessions: [{ concept: 'leafOnly' }] });
    expect(coverage).toEqual({ coveredLeafCount: 1, totalLeafCount: 1, percent: 100 });
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

  it('accepts a goal with exam + time-budget fields and persists them unchanged otherwise', () => {
    const parsed = goalSchema.safeParse({
      concept: cid,
      title: 'G',
      deadline: '2999-01-01',
      examName: 'Final Exam',
      studyDays: 30,
      minutesPerDay: 60,
      restDays: [0, 6],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.examName).toBe('Final Exam');
    expect(parsed.data.studyDays).toBe(30);
  });

  it('still accepts a goal without the new fields (backward compatible)', () => {
    expect(goalSchema.safeParse({ concept: cid, title: 'G', deadline: '2999-01-01' }).success).toBe(true);
  });

  it('rejects out-of-range time-budget values', () => {
    expect(
      goalSchema.safeParse({ concept: cid, title: 'G', deadline: '2999-01-01', studyDays: 0 }).success,
    ).toBe(false);
    expect(
      goalSchema.safeParse({ concept: cid, title: 'G', deadline: '2999-01-01', minutesPerDay: 5 }).success,
    ).toBe(false);
    expect(
      goalSchema.safeParse({ concept: cid, title: 'G', deadline: '2999-01-01', restDays: [7] }).success,
    ).toBe(false);
  });

  it('Phase C: targetScore is now a 0-10 exam score, not a 0-100 mastery %', () => {
    expect(goalSchema.safeParse({ concept: cid, title: 'G', deadline: '2999-01-01', targetScore: 8 }).success).toBe(
      true,
    );
    expect(
      goalSchema.safeParse({ concept: cid, title: 'G', deadline: '2999-01-01', targetScore: 80 }).success,
    ).toBe(false);
  });

  it('Phase C: accepts startDate + the new advanced-options fields', () => {
    const parsed = goalSchema.safeParse({
      concept: cid,
      title: 'G',
      deadline: '2999-01-01',
      startDate: '2998-12-01',
      examScope: 'Chương 1-5',
      examFormat: 'Trắc nghiệm',
      selfReportedScore: 6,
      assetIds: [cid],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.data.examScope).toBe('Chương 1-5');
    expect(parsed.data.selfReportedScore).toBe(6);
  });

  it('Phase C: rejects an out-of-range selfReportedScore', () => {
    expect(
      goalSchema.safeParse({ concept: cid, title: 'G', deadline: '2999-01-01', selfReportedScore: 11 }).success,
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

describe('planning draft goal wizard (B2/B7)', () => {
  const Goal = require('./planning.goal.model');
  const service = require('./planning.service');

  afterEach(() => jest.clearAllMocks());

  it('saveDraftGoal creates a new draft when none exists', async () => {
    Goal.findOne.mockResolvedValue(null);
    Goal.create.mockResolvedValue({ status: 'draft', wizardStep: 1 });
    await service.saveDraftGoal('u1', { wizardStep: 1, concept: 'c1' });
    expect(Goal.create).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'u1', status: 'draft', wizardStep: 1, concept: 'c1' }),
    );
  });

  it('saveDraftGoal upserts the existing open draft instead of creating a new one', async () => {
    const draft = { owner: 'u1', status: 'draft', wizardStep: 1, save: jest.fn() };
    Goal.findOne.mockResolvedValue(draft);
    await service.saveDraftGoal('u1', { wizardStep: 2, examName: 'Final' });
    expect(Goal.create).not.toHaveBeenCalled();
    expect(draft.wizardStep).toBe(2);
    expect(draft.examName).toBe('Final');
    expect(draft.save).toHaveBeenCalled();
  });

  it('getOpenDraft returns the owner draft, if any', async () => {
    const populate = jest.fn().mockResolvedValue({ status: 'draft' });
    Goal.findOne.mockReturnValue({ populate });
    const result = await service.getOpenDraft('u1');
    expect(Goal.findOne).toHaveBeenCalledWith({ owner: 'u1', status: 'draft' });
    expect(result).toEqual({ status: 'draft' });
  });

  it('activate fails with a clear error if required fields are missing', async () => {
    const draft = { owner: 'u1', status: 'draft', concept: 'c1', save: jest.fn() };
    Goal.findById.mockResolvedValue(draft);
    await expect(service.activateDraftGoal('u1', 'g1', {})).rejects.toMatchObject({
      status: 400,
      code: 'GOAL_INCOMPLETE',
    });
  });

  it('activate succeeds and flips status + clears wizardStep when complete', async () => {
    const draft = {
      owner: 'u1',
      status: 'draft',
      wizardStep: 4,
      save: jest.fn(),
    };
    Goal.findById.mockResolvedValue(draft);
    const payload = {
      concept: 'c1',
      title: 'Final exam prep',
      deadline: new Date('2999-01-01'),
      examName: 'Final',
      targetScore: 80,
      studyDays: 20,
      minutesPerDay: 60,
    };
    const result = await service.activateDraftGoal('u1', 'g1', payload);
    expect(result.status).toBe('active');
    expect(result.wizardStep).toBe(null);
    expect(draft.save).toHaveBeenCalled();
  });

  it('activate rejects a goal that is not a draft', async () => {
    Goal.findById.mockResolvedValue({ owner: 'u1', status: 'active' });
    await expect(service.activateDraftGoal('u1', 'g1', {})).rejects.toMatchObject({
      status: 400,
      code: 'GOAL_NOT_DRAFT',
    });
  });

  it('Phase C: wizardStep is capped at 4 (the new step count), not 6', () => {
    const { draftGoalSchema } = require('./planning.validation');
    expect(draftGoalSchema.safeParse({ wizardStep: 4 }).success).toBe(true);
    expect(draftGoalSchema.safeParse({ wizardStep: 5 }).success).toBe(false);
  });

  it('Phase C: saveDraftGoal derives studyDays from startDate+deadline+restDays, not the raw input', async () => {
    const draft = { owner: 'u1', status: 'draft', save: jest.fn() };
    Goal.findOne.mockResolvedValue(draft);
    Goal.find.mockReturnValue({ populate: jest.fn().mockResolvedValue([]) });
    await service.saveDraftGoal('u1', {
      startDate: new Date('2026-12-01'),
      deadline: new Date('2026-12-10'), // 10 calendar days
      restDays: [0, 6], // weekends off
      minutesPerDay: 45,
      studyDays: 999, // must be ignored — re-derived below
    });
    // 2026-12-01..10: Sat(05)/Sun(06) = 2 rest days -> 10 - 2 = 8
    expect(draft.studyDays).toBe(8);
  });

  it('Phase C: activateDraftGoal with a 4-step draft round-trips end to end (startDate + new fields)', async () => {
    const draft = { owner: 'u1', status: 'draft', wizardStep: 4, save: jest.fn() };
    Goal.findById.mockResolvedValue(draft);
    const result = await service.activateDraftGoal('u1', 'g1', {
      concept: 'c1',
      title: 'Final exam prep',
      deadline: new Date('2026-12-10'),
      startDate: new Date('2026-12-01'),
      restDays: [0, 6],
      examName: 'Final',
      targetScore: 8,
      minutesPerDay: 45,
      examScope: 'Chương 1-5',
      selfReportedScore: 5,
    });
    expect(result.status).toBe('active');
    expect(result.wizardStep).toBe(null);
    expect(result.studyDays).toBe(8); // derived, not left undefined (would fail ACTIVATE_REQUIRED_FIELDS)
    expect(result.examScope).toBe('Chương 1-5');
  });
});

describe('planning goal overlap check (Phase C step 2)', () => {
  const Goal = require('./planning.goal.model');
  const service = require('./planning.service');

  afterEach(() => jest.clearAllMocks());

  it('warns when another active goal overlaps the proposed date range, summing minutes/day', async () => {
    Goal.find.mockReturnValue({
      populate: jest.fn().mockResolvedValue([
        {
          _id: 'g2',
          title: 'Vật lý',
          startDate: new Date('2026-12-01'),
          deadline: new Date('2026-12-10'),
          minutesPerDay: 30,
          concept: { name: 'Vật lý' },
        },
      ]),
    });
    const warning = await service.checkGoalOverlap(
      'u1',
      { startDate: new Date('2026-12-05'), deadline: new Date('2026-12-15'), minutesPerDay: 60 },
      'g1',
    );
    expect(warning).toEqual({ subjects: ['Vật lý'], totalMinutesPerDay: 90, overlapDays: 6 });
  });

  it('returns null when no active goal\'s date range overlaps', async () => {
    Goal.find.mockReturnValue({
      populate: jest.fn().mockResolvedValue([
        {
          _id: 'g2',
          title: 'Vật lý',
          startDate: new Date('2026-11-01'),
          deadline: new Date('2026-11-20'),
          minutesPerDay: 30,
          concept: { name: 'Vật lý' },
        },
      ]),
    });
    const warning = await service.checkGoalOverlap(
      'u1',
      { startDate: new Date('2026-12-05'), deadline: new Date('2026-12-15'), minutesPerDay: 60 },
      'g1',
    );
    expect(warning).toBeNull();
  });

  it('derives a legacy goal\'s range from deadline - studyDays when it has no startDate', async () => {
    Goal.find.mockReturnValue({
      populate: jest.fn().mockResolvedValue([
        { _id: 'g2', title: 'Hoá', deadline: new Date('2026-12-10'), studyDays: 10, minutesPerDay: 20, concept: null },
      ]),
    });
    // g2's derived range: 2026-12-01..10
    const warning = await service.checkGoalOverlap(
      'u1',
      { startDate: new Date('2026-12-08'), deadline: new Date('2026-12-20'), minutesPerDay: 50 },
      'g1',
    );
    expect(warning).toMatchObject({ subjects: ['Hoá'], totalMinutesPerDay: 70, overlapDays: 3 });
  });

  it('returns null when the candidate itself has no usable date range', async () => {
    const warning = await service.checkGoalOverlap('u1', { minutesPerDay: 60 }, 'g1');
    expect(warning).toBeNull();
    expect(Goal.find).not.toHaveBeenCalled();
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

  describe('daily plan / "Hôm nay" (derived grouping)', () => {
    const at = (d, h = '08') => new Date(`2026-11-${d}T${h}:00:00Z`);
    const mk = (id, d, extra = {}) => ({
      _id: id, concept: 'c', startAt: at(d), durationMin: 30, status: 'planned', questions: [], ...extra,
    });

    it('includes only sessions on the requested day, from active plans only', async () => {
      const activePlan = { _id: 'p1', status: 'active', sessions: [mk('s1', '20'), mk('s2', '21')] };
      const otherDayPlan = { _id: 'p2', status: 'active', sessions: [mk('s3', '22')] };
      Plan.find.mockResolvedValue([activePlan, otherDayPlan]);

      const result = await service.getDailyPlan('u1', { date: at('20', '00') });

      expect(Plan.find).toHaveBeenCalledWith({ owner: 'u1', status: 'active' });
      expect(result.tasks.map((t) => t.sessionId)).toEqual(['s1']);
      expect(result.tasks[0]).toMatchObject({ planId: 'p1', sessionId: 's1', hasQuiz: false });
    });

    it('non-active plans never reach the query, so their sessions are excluded', async () => {
      Plan.find.mockResolvedValue([]); // proposed/superseded plans are filtered out by { status: 'active' }
      const result = await service.getDailyPlan('u1', { date: at('20', '00') });
      expect(result.tasks).toEqual([]);
    });

    it('returns an empty list when nothing is planned for that day', async () => {
      Plan.find.mockResolvedValue([{ _id: 'p1', status: 'active', sessions: [mk('s1', '25')] }]);
      const result = await service.getDailyPlan('u1', { date: at('20', '00') });
      expect(result.tasks).toEqual([]);
    });

    it('sorts tasks by startAt and flags sessions that carry a quiz', async () => {
      const plan = {
        _id: 'p1',
        status: 'active',
        sessions: [mk('s1', '20', { startAt: at('20', '14') }), mk('s2', '20', { startAt: at('20', '09'), questions: ['q1'] })],
      };
      Plan.find.mockResolvedValue([plan]);
      const result = await service.getDailyPlan('u1', { date: at('20', '00') });
      expect(result.tasks.map((t) => t.sessionId)).toEqual(['s2', 's1']);
      expect(result.tasks[0].hasQuiz).toBe(true);
      expect(result.totalMinutes).toBe(60);
      expect(result.completedMinutes).toBe(0);
      expect(result.tasks[0].taskType).toBe('EXERCISE');
      expect(result.tasks[0].breakdown[0].type).toBe('EXERCISE');
    });
  });

  describe('goal lifecycle (pause / resume / close / archive)', () => {
    const PlanningGoal = require('./planning.goal.model');

    it('pauses an active goal and resumes a paused goal', async () => {
      const goal = { _id: 'g1', owner: 'u1', status: 'active', save: jest.fn() };
      PlanningGoal.findById.mockResolvedValue(goal);

      await service.pauseGoal('g1', { id: 'u1' }, { reason: 'Thi giữa kỳ môn khác' });
      expect(goal.status).toBe('paused');
      expect(goal.pauseReason).toBe('Thi giữa kỳ môn khác');
      expect(goal.pausedAt).toBeInstanceOf(Date);
      expect(goal.save).toHaveBeenCalledTimes(1);

      await service.resumeGoal('g1', { id: 'u1' });
      expect(goal.status).toBe('active');
      expect(goal.save).toHaveBeenCalledTimes(2);
    });

    it('rejects pausing a non-active goal', async () => {
      PlanningGoal.findById.mockResolvedValue({ _id: 'g1', owner: 'u1', status: 'draft', save: jest.fn() });
      await expect(service.pauseGoal('g1', { id: 'u1' })).rejects.toMatchObject({ status: 409 });
    });

    it('closes an active goal with examResultScore and closingNote', async () => {
      const goal = { _id: 'g1', owner: 'u1', status: 'active', save: jest.fn() };
      PlanningGoal.findById.mockResolvedValue(goal);

      await service.closeGoal('g1', { id: 'u1' }, { examResultScore: 8.5, closingNote: 'Đạt mục tiêu' });
      expect(goal.status).toBe('completed');
      expect(goal.examResultScore).toBe(8.5);
      expect(goal.closingNote).toBe('Đạt mục tiêu');
      expect(goal.closedAt).toBeInstanceOf(Date);
    });

    it('archives a goal', async () => {
      const goal = { _id: 'g1', owner: 'u1', status: 'completed', closedAt: null, save: jest.fn() };
      PlanningGoal.findById.mockResolvedValue(goal);

      await service.archiveGoal('g1', { id: 'u1' });
      expect(goal.status).toBe('archived');
      expect(goal.closedAt).toBeInstanceOf(Date);
    });
  });
});
