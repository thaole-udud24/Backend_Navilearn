const { gradeEssay, validateGeneratedQuestionShape } = require('./ai-assist.service');

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
});
