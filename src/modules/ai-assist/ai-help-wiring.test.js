jest.mock('./ai-assist.model', () => ({ create: jest.fn().mockResolvedValue({ id: 'log1' }) }));
jest.mock('../knowledge/knowledge.model', () => ({ findById: jest.fn() }));
jest.mock('../../integrations/ai', () => ({ ask: jest.fn() }));
jest.mock('./ai-help.service', () => ({
  assertActiveAttempt: jest.fn(),
  recordHelp: jest.fn(),
}));

const Concept = require('../knowledge/knowledge.model');
const ai = require('../../integrations/ai');
const aiHelpService = require('./ai-help.service');
const { practiceQuestion, askWithSource, essayFeedback } = require('./ai-assist.service');

beforeEach(() => {
  jest.clearAllMocks();
  Concept.findById.mockResolvedValue({ id: 'c1', name: 'Đạo hàm', description: '' });
  ai.ask.mockResolvedValue({
    answer: 'Q: 2+2=?\nA) 3\nB) 4\nC) 5\nD) 6\nCORRECT: B',
  });
});

it('attributes each supported AI action to its active assessment', async () => {
  await practiceQuestion('u1', { concept: 'c1', assessmentItemId: 'a1' });
  await askWithSource('u1', { question: 'Đạo hàm là gì?', concept: 'c1', assessmentItemId: 'a1' });
  await essayFeedback('u1', {
    conceptId: 'c1', questionText: 'Giải thích', answerText: 'Câu trả lời', assessmentItemId: 'a1',
  });

  expect(aiHelpService.assertActiveAttempt).toHaveBeenCalledTimes(3);
  expect(aiHelpService.recordHelp.mock.calls).toEqual([
    ['u1', 'a1', 'c1', 'practice_question'],
    ['u1', 'a1', 'c1', 'qa'],
    ['u1', 'a1', 'c1', 'essay_feedback'],
  ]);
});
