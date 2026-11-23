const {
  gradeEssay,
  validateGeneratedQuestionShape,
  parseGeneratedSessions,
  generateConceptDraft,
  parseGeneratedTemplateSteps,
  generateTemplateDraft,
} = require('./ai-assist.service');

jest.mock('./ai-assist.model', () => ({ create: jest.fn().mockResolvedValue({}) }));
// gradeEssay's scorePercent is a local keyword-overlap heuristic (see ai-assist.service.js); only
// the unused feedback text comes from the real AI call, so stub it instead of hitting the network.
jest.mock('../../integrations/ai', () => ({ ask: jest.fn().mockResolvedValue({ answer: 'stub feedback' }) }));

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
        { dayOffset: 2, durationMin: 45, note: 'Ôn lại chương 1' },
        { dayOffset: 5, durationMin: 180, note: 'Luyện đề' },
      ]);
    });

    it('returns an empty array for free-form text with no recognizable structure', () => {
      expect(parseGeneratedSessions('sorry, I cannot help with that')).toEqual([]);
    });

    it('ignores malformed lines but keeps well-formed ones in the same response', () => {
      const raw = 'not a session line\nDAY: 1 | DURATION: 30 | NOTE: Đọc tài liệu';
      expect(parseGeneratedSessions(raw)).toEqual([{ dayOffset: 1, durationMin: 30, note: 'Đọc tài liệu' }]);
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
});
