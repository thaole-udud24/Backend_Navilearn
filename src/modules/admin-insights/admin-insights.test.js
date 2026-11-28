jest.mock('../mastery/mastery.model');
jest.mock('../assessment/assessment.model');
jest.mock('../wrong-item/wrong-item.model');
jest.mock('../knowledge/knowledge.model');
jest.mock('../question-bank/question-bank.model');

const MasteryItem = require('../mastery/mastery.model');
const AssessmentItem = require('../assessment/assessment.model');
const WrongItem = require('../wrong-item/wrong-item.model');
const Concept = require('../knowledge/knowledge.model');
const QuestionItem = require('../question-bank/question-bank.model');
const service = require('./admin-insights.service');

describe('admin-insights.service', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('learningEffectivenessReport', () => {
    const subjectId = 'subj1';
    const childId = 'child1';

    beforeEach(() => {
      Concept.find.mockReturnValue({
        select: () => ({
          lean: () =>
            Promise.resolve([
              { _id: subjectId, name: 'Toán', parentConcept: null },
              { _id: childId, name: 'Đại số', parentConcept: subjectId },
            ]),
        }),
      });
      MasteryItem.find.mockReturnValue({
        select: () => ({
          lean: () =>
            Promise.resolve([
              { owner: 'u1', concept: childId, score: 80, goalScore: 70 },
              { owner: 'u2', concept: childId, score: 40, goalScore: 70 },
              { owner: 'u3', concept: childId, score: 60, goalScore: null },
            ]),
        }),
      });
      AssessmentItem.distinct
        .mockResolvedValueOnce(['u1', 'u2', 'u3']) // ever active
        .mockResolvedValueOnce(['u1']); // active in last 7 days
    });

    it('computes goal completion, average Mastery, and 7-day retention from real MasteryItem/AssessmentItem rows', async () => {
      const report = await service.learningEffectivenessReport({});
      // 1 of 2 learners with a goal met it (u1: 80>=70; u2: 40<70) -> 50%.
      expect(report.summary.goalCompletionRate).toBe(50);
      // avg of 80, 40, 60 = 60.
      expect(report.summary.avgMasteryScore).toBe(60);
      // 1 of 3 ever-active learners active in the last 7 days -> 33%.
      expect(report.summary.retention7dRate).toBe(33);
    });

    it('rolls every concept up to its top-level subject (parentConcept = null)', async () => {
      const report = await service.learningEffectivenessReport({});
      expect(report.bySubject).toEqual([{ subjectId: subjectId, subjectName: 'Toán', avgScore: 60, learnerCount: 3 }]);
    });
  });

  describe('volumeReport', () => {
    it('derives pass rate per day from submitted AssessmentItem rows', async () => {
      AssessmentItem.aggregate.mockResolvedValue([
        { _id: '2026-11-20', attempts: 4, passed: 2 },
        { _id: '2026-11-21', attempts: 2, passed: 2 },
      ]);
      const report = await service.volumeReport({ days: 30 });
      expect(report.totalAttempts).toBe(6);
      expect(report.overallPassRate).toBe(67); // (2+2)/6
      expect(report.byDay[0]).toEqual({ date: '2026-11-20', attempts: 4, passRate: 50 });
    });
  });

  describe('topMissedQuestions', () => {
    it('ranks questions by total cross-student wrong count, including deleted questions gracefully', async () => {
      WrongItem.aggregate.mockResolvedValue([
        { _id: 'q1', totalWrongCount: 9, studentCount: 3, concept: 'c1' },
        { _id: 'q2', totalWrongCount: 2, studentCount: 1, concept: 'c1' },
      ]);
      QuestionItem.find.mockReturnValue({
        select: () => ({
          populate: () => ({
            lean: () => Promise.resolve([{ _id: 'q1', text: 'Câu 1?', concept: { name: 'Đại số' } }]),
          }),
        }),
      });
      const rows = await service.topMissedQuestions({ limit: 10 });
      expect(rows[0]).toEqual({
        questionId: 'q1',
        questionText: 'Câu 1?',
        conceptName: 'Đại số',
        totalWrongCount: 9,
        studentCount: 3,
      });
      // q2's QuestionItem wasn't returned (e.g. soft-deleted) -> falls back instead of crashing.
      expect(rows[1].questionText).toBe('(Câu hỏi đã bị xoá)');
    });
  });
});
