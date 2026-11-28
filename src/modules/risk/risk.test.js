jest.mock('../planning/planning.service');
jest.mock('../mastery/mastery.service');
jest.mock('../business-rule/business-rule.service');
jest.mock('./risk.model');
jest.mock('../assessment/assessment.model', () => ({
  find: jest.fn(),
}));

jest.mock('../knowledge/knowledge.model', () => ({
  find: jest.fn(),
}));

const AssessmentItem = require('../assessment/assessment.model');
const Concept = require('../knowledge/knowledge.model');
const planningService = require('../planning/planning.service');
const masteryService = require('../mastery/mastery.service');
const businessRuleService = require('../business-rule/business-rule.service');
const RiskWarningDismissal = require('./risk.model');
const service = require('./risk.service');

const now = new Date('2026-11-27T00:00:00Z');
const daysAgo = (n) => new Date(now.getTime() - n * 86400000);

const THRESHOLDS = {
  'risk.fallingBehindPercent': 15,
  'risk.decayDays': 14,
  'risk.weakMasteryPercent': 40,
};

function session({ chapterTitle, startAt, status = 'planned' }) {
  return { chapterTitle, startAt: new Date(startAt), status };
}

function mockAttempts(rows) {
  AssessmentItem.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      sort: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue(rows),
      }),
    }),
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  businessRuleService.getRiskThresholds.mockResolvedValue(THRESHOLDS);
  RiskWarningDismissal.find.mockResolvedValue([]);
  mockAttempts([]);
  businessRuleService.getByCode.mockResolvedValue({ value: 0.7, isActive: true });
  Concept.find.mockReturnValue({
    select: jest.fn().mockReturnValue({
      lean: jest.fn().mockResolvedValue([{ _id: 'c1', name: 'Đạo hàm' }]),
    }),
  });
});

describe('risk.service.listWarnings — N9/BR-13 (system-generated, not student self-report)', () => {
  it('flags a chặng as at-risk when the completion gap exceeds the Admin threshold (B14)', async () => {
    planningService.listForOwner.mockResolvedValue({
      items: [
        {
          _id: 'p1',
          sessions: [
            session({ chapterTitle: 'Chặng 2', startAt: daysAgo(5), status: 'planned' }), // overdue
            session({ chapterTitle: 'Chặng 2', startAt: daysAgo(4), status: 'planned' }), // overdue
            session({ chapterTitle: 'Chặng 2', startAt: daysAgo(1), status: 'done' }),
            session({ chapterTitle: 'Chặng 2', startAt: daysAgo(-5), status: 'planned' }), // not due yet
          ],
        },
      ],
    });
    masteryService.listForOwner.mockResolvedValue({ items: [] });

    const warnings = await service.listWarnings('u1', now);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({
      type: 'schedule',
      planId: 'p1',
      actions: ['replan', 'keep', 'snooze'],
    });
    expect(warnings[0].reason).toMatch(/Tiến độ 25% so với kế hoạch 75%/);
  });

  it('does not flag a chặng that is on schedule (no completion gap)', async () => {
    planningService.listForOwner.mockResolvedValue({
      items: [
        {
          _id: 'p1',
          sessions: [
            session({ chapterTitle: 'Chặng 1', startAt: daysAgo(3), status: 'done' }),
            session({ chapterTitle: 'Chặng 1', startAt: daysAgo(2), status: 'done' }), // both due sessions done
            session({ chapterTitle: 'Chặng 1', startAt: daysAgo(-5), status: 'planned' }), // not due yet
            session({ chapterTitle: 'Chặng 1', startAt: daysAgo(-10), status: 'planned' }),
          ],
        },
      ],
    });
    masteryService.listForOwner.mockResolvedValue({ items: [] });

    expect(await service.listWarnings('u1', now)).toEqual([]);
  });

  it('a lower Admin-configured threshold catches a gap that a higher one would not (proves the wiring is real)', async () => {
    planningService.listForOwner.mockResolvedValue({
      items: [
        {
          _id: 'p1',
          sessions: [
            session({ chapterTitle: 'Chặng 1', startAt: daysAgo(3), status: 'done' }),
            session({ chapterTitle: 'Chặng 1', startAt: daysAgo(2), status: 'done' }),
            session({ chapterTitle: 'Chặng 1', startAt: daysAgo(1), status: 'planned' }), // gap ≈ 33%
          ],
        },
      ],
    });
    masteryService.listForOwner.mockResolvedValue({ items: [] });

    businessRuleService.getRiskThresholds.mockResolvedValue({
      ...THRESHOLDS,
      'risk.fallingBehindPercent': 50,
    });
    expect(await service.listWarnings('u1', now)).toEqual([]);

    businessRuleService.getRiskThresholds.mockResolvedValue({
      ...THRESHOLDS,
      'risk.fallingBehindPercent': 10,
    });
    expect(await service.listWarnings('u1', now)).toHaveLength(1);
  });

  it('flags a weak concept below the Admin-configured mastery threshold, with a reason', async () => {
    planningService.listForOwner.mockResolvedValue({ items: [] });
    masteryService.listForOwner.mockResolvedValue({
      items: [
        {
          concept: { _id: 'c1', name: 'Tích phân' },
          score: 31,
          attemptsCount: 3,
          learningState: 'PRACTICING',
        },
      ],
    });
    masteryService.computeDisplayState.mockReturnValue('PRACTICING');

    const warnings = await service.listWarnings('u1', now);
    expect(warnings).toEqual([
      expect.objectContaining({ key: 'mastery:c1', type: 'mastery', reason: expect.stringContaining('40%') }),
    ]);
  });

  it('does not flag a concept at or above the mastery threshold', async () => {
    planningService.listForOwner.mockResolvedValue({ items: [] });
    masteryService.listForOwner.mockResolvedValue({
      items: [
        {
          concept: { _id: 'c1', name: 'Giới hạn' },
          score: 40,
          attemptsCount: 3,
          learningState: 'PRACTICING',
        },
      ],
    });
    masteryService.computeDisplayState.mockReturnValue('PRACTICING');

    expect(await service.listWarnings('u1', now)).toEqual([]);
  });

  it('flags a concept in DECAY_RISK using the Admin-configured decay-days threshold', async () => {
    planningService.listForOwner.mockResolvedValue({ items: [] });
    const item = {
      concept: { _id: 'c1', name: 'Đạo hàm' },
      score: 70,
      attemptsCount: 3,
      learningState: 'UNDERSTOOD',
      lastAttemptAt: daysAgo(20),
    };
    masteryService.listForOwner.mockResolvedValue({ items: [item] });
    masteryService.computeDisplayState.mockImplementation((m, decayDays) =>
      decayDays <= 20 ? 'DECAY_RISK' : 'UNDERSTOOD',
    );

    const warnings = await service.listWarnings('u1', now);
    expect(warnings).toEqual([expect.objectContaining({ key: 'decay:c1', type: 'decay', severity: 'thap' })]);
  });

  it('hides a warning the student already dismissed ("giữ nguyên")', async () => {
    planningService.listForOwner.mockResolvedValue({ items: [] });
    masteryService.listForOwner.mockResolvedValue({
      items: [
        {
          concept: { _id: 'c1', name: 'Tích phân' },
          score: 31,
          attemptsCount: 3,
          learningState: 'PRACTICING',
        },
      ],
    });
    masteryService.computeDisplayState.mockReturnValue('PRACTICING');
    RiskWarningDismissal.find.mockResolvedValue([{ key: 'mastery:c1', action: 'keep', until: null }]);

    expect(await service.listWarnings('u1', now)).toEqual([]);
  });

  it('resurfaces a snoozed warning once the snooze window has passed', async () => {
    planningService.listForOwner.mockResolvedValue({ items: [] });
    masteryService.listForOwner.mockResolvedValue({
      items: [
        {
          concept: { _id: 'c1', name: 'Tích phân' },
          score: 31,
          attemptsCount: 3,
          learningState: 'PRACTICING',
        },
      ],
    });
    masteryService.computeDisplayState.mockReturnValue('PRACTICING');
    RiskWarningDismissal.find.mockResolvedValue([{ key: 'mastery:c1', action: 'snooze', until: daysAgo(1) }]);

    expect(await service.listWarnings('u1', now)).toHaveLength(1);
  });

  it('không báo Retention Risk khi vừa luyện tập dù điểm dưới 60', async () => {
    planningService.listForOwner.mockResolvedValue({ items: [] });
    masteryService.listForOwner.mockResolvedValue({
      items: [
        {
          concept: { _id: 'c1', name: 'Đạo hàm' },
          score: 55,
          attemptsCount: 3,
          learningState: 'UNDERSTOOD',
          lastAttemptAt: now,
        },
      ],
    });

    expect(await service.listWarnings('u1', now)).toEqual([]);
  });
});
describe('BE-RSK-06 AI Dependency Risk', () => {
  const assisted = (day) => ({
    concept: 'c1',
    aiHelpLevel: 2,
    independentCheck: false,
    submittedAt: daysAgo(day),
  });

  const unassisted = (day) => ({
    concept: 'c1',
    aiHelpLevel: 0,
    independentCheck: false,
    submittedAt: daysAgo(day),
  });

  beforeEach(() => {
    planningService.listForOwner.mockResolvedValue({ items: [] });
    masteryService.listForOwner.mockResolvedValue({ items: [] });
  });

  it('cảnh báo khi AI Help Ratio vượt BR-15', async () => {
    mockAttempts([assisted(1), assisted(2), assisted(3), unassisted(4)]);

    const warnings = await service.listWarnings('u1', now);

    expect(warnings).toEqual([
      expect.objectContaining({
        key: 'ai_dependency:c1',
        severity: 'trung_binh',
        reason: expect.stringContaining('75%'),
      }),
    ]);
  });

  it('nâng mức cảnh báo nếu kiểm chứng độc lập sau đó không đạt', async () => {
    mockAttempts([
      {
        concept: 'c1',
        aiHelpLevel: 0,
        independentCheck: true,
        passed: false,
        score: 30,
        submittedAt: daysAgo(0),
      },
      assisted(1),
      assisted(2),
      assisted(3),
      unassisted(4),
    ]);

    const warnings = await service.listWarnings('u1', now);

    expect(warnings).toEqual([
      expect.objectContaining({
        key: 'ai_dependency:c1',
        severity: 'cao',
        reason: expect.stringContaining('30%'),
      }),
    ]);
    expect(warnings[0].reason).toContain('75%');
  });

  it('không cảnh báo nếu kiểm chứng độc lập sau lần dùng AI gần nhất đã đạt', async () => {
    mockAttempts([
      {
        concept: 'c1',
        aiHelpLevel: 0,
        independentCheck: true,
        passed: true,
        score: 85,
        submittedAt: daysAgo(0),
      },
      assisted(1),
      assisted(2),
      assisted(3),
      assisted(4),
    ]);

    expect(await service.listWarnings('u1', now)).toEqual([]);
  });

  it('không cảnh báo ở đúng ngưỡng BR-15', async () => {
    businessRuleService.getByCode.mockResolvedValue({
      value: 0.75,
      isActive: true,
    });
    mockAttempts([assisted(1), assisted(2), assisted(3), unassisted(4)]);

    expect(await service.listWarnings('u1', now)).toEqual([]);
  });
});
describe('risk.service.dismiss', () => {
  it('"keep" suppresses indefinitely (until: null)', async () => {
    RiskWarningDismissal.findOneAndUpdate.mockResolvedValue({
      key: 'mastery:c1',
      action: 'keep',
      until: null,
    });
    await service.dismiss('u1', 'mastery:c1', 'keep', now);
    expect(RiskWarningDismissal.findOneAndUpdate).toHaveBeenCalledWith(
      { owner: 'u1', key: 'mastery:c1' },
      expect.objectContaining({ action: 'keep', until: null }),
      expect.objectContaining({ upsert: true }),
    );
  });

  it('"snooze" sets an until date a few days out', async () => {
    RiskWarningDismissal.findOneAndUpdate.mockResolvedValue({});
    await service.dismiss('u1', 'mastery:c1', 'snooze', now);
    const [, update] = RiskWarningDismissal.findOneAndUpdate.mock.calls[0];
    expect(update.until.getTime()).toBeGreaterThan(now.getTime());
  });

  it('rejects an empty key', async () => {
    await expect(service.dismiss('u1', '', 'keep', now)).rejects.toMatchObject({ status: 400 });
  });
});
