const { gradeEssay } = require('./ai-assist.service');

jest.mock('./ai-assist.model', () => ({ create: jest.fn().mockResolvedValue({}) }));

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
});
