const {
  gradeEssay,
  validateGeneratedQuestionShape,
  parseGeneratedSessions,
  generateConceptDraft,
  parseGeneratedTemplateSteps,
  generateTemplateDraft,
  generateStudyPlan,
  adminOverview,
} = require('./ai-assist.service');

jest.mock('./ai-assist.model', () => ({
  create: jest.fn().mockResolvedValue({}),
  countDocuments: jest.fn().mockResolvedValue(0),
  find: jest.fn(),
}));
// gradeEssay's scorePercent is a local keyword-overlap heuristic (see ai-assist.service.js); only
// the unused feedback text comes from the real AI call, so stub it instead of hitting the network.
jest.mock('../../integrations/ai', () => ({ ask: jest.fn().mockResolvedValue({ answer: 'stub feedback' }) }));
jest.mock('../knowledge/knowledge.model');
jest.mock('../knowledge/knowledge.service');
jest.mock('../planning/planning.service');
// Keep the real criterionPoints math; only stub the DB lookup for the rubric-grading test below.
jest.mock('../assessment-config/assessment-config.service', () => ({
  ...jest.requireActual('../assessment-config/assessment-config.service'),
  findActiveRubricForConcept: jest.fn().mockResolvedValue(null),
}));

describe('ai-assist module', () => {
  it('scores an essay higher when it shares more words with the reference answer', async () => {
    const low = await gradeEssay('owner1', {
      conceptId: 'c1',
      referenceAnswer: 'định lý Pytago tổng bình phương hai cạnh góc vuông bằng bình phương cạnh huyền',
      studentText: 'tôi không biết',
    });
    const high = await gradeEssay('owner1', {
      conceptId: 'c1',
      referenceAnswer: 'định lý Pytago tổng bình phương hai cạnh góc vuông bằng bình phương cạnh huyền',
      studentText: 'định lý Pytago nói tổng bình phương hai cạnh góc vuông bằng bình phương cạnh huyền',
    });
    expect(high.scorePercent).toBeGreaterThan(low.scorePercent);
  });

  it('B5: grades against the rubric using weightPct/totalPoints, not a raw maxPoints field', async () => {
    const assessmentConfigService = require('../assessment-config/assessment-config.service');
    const ai = require('../../integrations/ai');
    assessmentConfigService.findActiveRubricForConcept.mockResolvedValueOnce({
      totalPoints: 20,
      criteria: [{ name: 'Clarity', weightPct: 30, description: 'Rõ ràng' }],
    });

    await gradeEssay('owner1', {
      conceptId: 'a'.repeat(24),
      referenceAnswer: 'ref',
      studentText: 'student',
    });

    const [prompt] = ai.ask.mock.calls[ai.ask.mock.calls.length - 1];
    expect(prompt).toContain('Clarity (30%, max 6 points)');
  });

  describe('validateGeneratedQuestionShape (UC-AP-AIA-04)', () => {
    it('accepts a well-formed MCQ with exactly one correct option', () => {
      const raw = 'Q: 2+2=?\nA) 3\nB) 4\nC) 5\nD) 6\nCORRECT: B';
      const result = validateGeneratedQuestionShape(raw);
      expect(result.valid).toBe(true);
      expect(result.text).toBe('2+2=?');
      expect(result.options.filter((o) => o.isCorrect)).toHaveLength(1);
      expect(result.options[1]).toEqual({ text: '4', isCorrect: true });
    });

    it('rejects a response missing an option', () => {
      const raw = 'Q: 2+2=?\nA) 3\nB) 4\nC) 5\nCORRECT: B';
      expect(validateGeneratedQuestionShape(raw).valid).toBe(false);
    });

    it('rejects a response with an out-of-range CORRECT letter', () => {
      const raw = 'Q: 2+2=?\nA) 3\nB) 4\nC) 5\nD) 6\nCORRECT: E';
      expect(validateGeneratedQuestionShape(raw).valid).toBe(false);
    });

    it('rejects free-form text with no recognizable structure', () => {
      expect(validateGeneratedQuestionShape('sorry, I cannot help with that').valid).toBe(false);
    });
  });

  describe('parseGeneratedSessions (UC-PLN-AI-01)', () => {
    it('parses well-formed DAY|DURATION|NOTE lines, clamping out-of-range values', () => {
      const raw = 'DAY: 2 | DURATION: 45 | NOTE: Ôn lại chương 1\nDAY: 5 | DURATION: 999 | NOTE: Luyện đề';
      const sessions = parseGeneratedSessions(raw);
      expect(sessions).toEqual([
        { dayOffset: 2, durationMin: 45, concept: null, note: 'Ôn lại chương 1' },
        { dayOffset: 5, durationMin: 180, concept: null, note: 'Luyện đề' },
      ]);
    });

    it('returns an empty array for free-form text with no recognizable structure', () => {
      expect(parseGeneratedSessions('sorry, I cannot help with that')).toEqual([]);
    });

    it('ignores malformed lines but keeps well-formed ones in the same response', () => {
      const raw = 'not a session line\nDAY: 1 | DURATION: 30 | NOTE: Đọc tài liệu';
      expect(parseGeneratedSessions(raw)).toEqual([
        { dayOffset: 1, durationMin: 30, concept: null, note: 'Đọc tài liệu' },
      ]);
    });

    it('keeps a CONCEPT tag that is a real offered leaf id', () => {
      const raw = 'DAY: 1 | DURATION: 30 | CONCEPT: aaaaaaaaaaaaaaaaaaaaaaaa | NOTE: Ôn đạo hàm';
      expect(parseGeneratedSessions(raw, ['aaaaaaaaaaaaaaaaaaaaaaaa'])).toEqual([
        { dayOffset: 1, durationMin: 30, concept: 'aaaaaaaaaaaaaaaaaaaaaaaa', note: 'Ôn đạo hàm' },
      ]);
    });

    it('rejects a CONCEPT tag that is not in the offered leaf list, instead of trusting it blindly', () => {
      const raw = 'DAY: 1 | DURATION: 30 | CONCEPT: bbbbbbbbbbbbbbbbbbbbbbbb | NOTE: Ôn tập';
      expect(parseGeneratedSessions(raw, ['aaaaaaaaaaaaaaaaaaaaaaaa'])).toEqual([
        { dayOffset: 1, durationMin: 30, concept: null, note: 'Ôn tập' },
      ]);
    });
  });

  describe('generateStudyPlan (UC-PLN-AI-01) — Plan↔Goal link + real leaf concept tagging', () => {
    const ai = require('../../integrations/ai');
    const Concept = require('../knowledge/knowledge.model');
    const knowledgeService = require('../knowledge/knowledge.service');
    const planningService = require('../planning/planning.service');

    beforeEach(() => {
      jest.clearAllMocks();
      planningService.getOwnedGoal.mockResolvedValue({
        _id: 'g1',
        title: 'Giỏi Toán',
        concept: 'subject1',
        deadline: new Date(Date.now() + 10 * 86400000),
      });
      Concept.findById.mockResolvedValue({ _id: 'subject1', name: 'Toán' });
      knowledgeService.getDescendantLeafIds.mockResolvedValue([]);
      planningService.create.mockImplementation(async (owner, data) => ({ owner, ...data }));
    });

    it('threads the goal id onto the created plan (Plan↔Goal link fix)', async () => {
      ai.ask.mockResolvedValueOnce({ answer: 'DAY: 1 | DURATION: 30 | NOTE: Ôn tập' });
      await generateStudyPlan('u1', 'g1');
      expect(planningService.create).toHaveBeenCalledWith('u1', expect.objectContaining({ goal: 'g1' }));
    });

    it('falls back to the goal root concept when there are no leaf concepts to offer', async () => {
      ai.ask.mockResolvedValueOnce({ answer: 'DAY: 1 | DURATION: 30 | NOTE: Ôn tập' });
      const { plan } = await generateStudyPlan('u1', 'g1');
      expect(plan.sessions[0].concept).toBe('subject1');
    });

    it('tags a session with the AI-picked concept when it is a genuine descendant leaf', async () => {
      const leaf1 = 'a'.repeat(23) + '1';
      const leaf2 = 'a'.repeat(23) + '2';
      knowledgeService.getDescendantLeafIds.mockResolvedValue([leaf1, leaf2]);
      Concept.find.mockReturnValue({
        limit: () => [{ _id: leaf1, name: 'Đạo hàm' }, { _id: leaf2, name: 'Tích phân' }],
      });
      ai.ask.mockResolvedValueOnce({ answer: `DAY: 1 | DURATION: 30 | CONCEPT: ${leaf1} | NOTE: Ôn đạo hàm` });
      const { plan } = await generateStudyPlan('u1', 'g1');
      expect(plan.sessions[0].concept).toBe(leaf1);
    });

    it('falls back to the root concept when the AI invents a concept id that is not a real descendant', async () => {
      const leaf1 = 'a'.repeat(23) + '1';
      const invented = 'f'.repeat(24);
      knowledgeService.getDescendantLeafIds.mockResolvedValue([leaf1]);
      Concept.find.mockReturnValue({ limit: () => [{ _id: leaf1, name: 'Đạo hàm' }] });
      ai.ask.mockResolvedValueOnce({
        answer: `DAY: 1 | DURATION: 30 | CONCEPT: ${invented} | NOTE: Ôn tập`,
      });
      const { plan } = await generateStudyPlan('u1', 'g1');
      expect(plan.sessions[0].concept).toBe('subject1');
    });
  });

  describe('generateConceptDraft (UC-KNW-AI-01)', () => {
    const ai = require('../../integrations/ai');

    it('parses a well-formed NAME/DESCRIPTION response', async () => {
      ai.ask.mockResolvedValueOnce({ answer: 'NAME: Đạo hàm\nDESCRIPTION: Tốc độ biến thiên của hàm số.' });
      const draft = await generateConceptDraft('admin1', { topic: 'Giải tích' });
      expect(draft).toMatchObject({
        valid: true,
        name: 'Đạo hàm',
        description: 'Tốc độ biến thiên của hàm số.',
      });
    });

    it('falls back to the topic as the name when the format is off, and marks it invalid', async () => {
      ai.ask.mockResolvedValueOnce({ answer: 'sorry, I cannot help with that' });
      const draft = await generateConceptDraft('admin1', { topic: 'Giải tích' });
      expect(draft).toMatchObject({ valid: false, name: 'Giải tích', description: '' });
    });
  });

  describe('parseGeneratedTemplateSteps / generateTemplateDraft (UC-PLN-TPL-04)', () => {
    const ai = require('../../integrations/ai');

    it('parses well-formed DAY|DURATION|THEORY|NOTE lines', () => {
      const raw = 'DAY: 1 | DURATION: 30 | THEORY: Ôn khái niệm cơ bản | NOTE: Đọc lý thuyết';
      expect(parseGeneratedTemplateSteps(raw)).toEqual([
        { dayOffset: 1, durationMin: 30, theoryContent: 'Ôn khái niệm cơ bản', note: 'Đọc lý thuyết' },
      ]);
    });

    it('returns an empty array for free-form text with no recognizable structure', () => {
      expect(parseGeneratedTemplateSteps('sorry, I cannot help with that')).toEqual([]);
    });

    it('generateTemplateDraft builds a reviewable draft from a topic, without saving a template', async () => {
      ai.ask.mockResolvedValueOnce({
        answer:
          'DAY: 1 | DURATION: 30 | THEORY: Lý thuyết A | NOTE: Đọc bài\nDAY: 3 | DURATION: 45 | THEORY: Lý thuyết B | NOTE: Luyện tập',
      });
      const draft = await generateTemplateDraft('admin1', { topic: 'Đạo hàm', sessionCount: 2 });
      expect(draft.valid).toBe(true);
      expect(draft.steps).toHaveLength(2);
      expect(draft.title).toContain('Đạo hàm');
    });

    it('falls back to an evenly-spaced draft when the format is off', async () => {
      ai.ask.mockResolvedValueOnce({ answer: 'not parseable' });
      const draft = await generateTemplateDraft('admin1', { topic: 'Đạo hàm', sessionCount: 3 });
      expect(draft.valid).toBe(false);
      expect(draft.steps).toHaveLength(3);
    });
  });

  describe('adminOverview (B6 Giám sát — real data only, no invented metrics)', () => {
    const AiAssistItem = require('./ai-assist.model');
    const mongoose = require('mongoose');

    beforeEach(() => {
      jest.clearAllMocks();
      AiAssistItem.countDocuments.mockResolvedValue(0);
      AiAssistItem.find.mockReturnValue({
        sort: () => ({
          limit: () => ({
            populate: () => ({
              populate: jest.fn().mockResolvedValue([]),
            }),
          }),
        }),
      });
    });

    it('reports DB as connected and the recent AI-request counts it computed', async () => {
      AiAssistItem.countDocuments
        .mockResolvedValueOnce(12) // totalLast24h
        .mockResolvedValueOnce(3) // invalidLast24h
        .mockResolvedValueOnce(1); // reportedLast24h
      mongoose.connection.readyState = 1;

      const overview = await adminOverview();

      expect(overview.health.dbConnected).toBe(true);
      expect(overview.health.dbState).toBe('connected');
      expect(overview.aiRequests).toMatchObject({ totalLast24h: 12, invalidLast24h: 3, reportedLast24h: 1 });
      expect(overview.rateLimit.max).toBeGreaterThan(0);
    });

    it('reports DB as disconnected when mongoose is not in the connected state', async () => {
      mongoose.connection.readyState = 0;
      const overview = await adminOverview();
      expect(overview.health.dbConnected).toBe(false);
      expect(overview.health.dbState).toBe('disconnected');
    });
  });
});
