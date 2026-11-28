jest.mock('../knowledge/knowledge.model');
jest.mock('../question-bank/question-bank.model');
jest.mock('../assessment-config/assessment-config.model');
jest.mock('../mastery/mastery.model');
jest.mock('../assessment/assessment.model');
jest.mock('../wrong-item/wrong-item.model');
jest.mock('../student-subject/student-subject.model');
jest.mock('../planning/planning.model');
jest.mock('../asset/asset.model');
jest.mock('../student-document/student-document.model');
jest.mock('../flashcard/flashcard.model');
jest.mock('../account/account.auth.model');
jest.mock('../../shared/audit-log');

const Concept = require('../knowledge/knowledge.model');
const QuestionItem = require('../question-bank/question-bank.model');
const AssessmentConfigItem = require('../assessment-config/assessment-config.model');
const MasteryItem = require('../mastery/mastery.model');
const AssessmentItem = require('../assessment/assessment.model');
const WrongItem = require('../wrong-item/wrong-item.model');
const StudentSubjectItem = require('../student-subject/student-subject.model');
const PlanningItem = require('../planning/planning.model');
const AssetItem = require('../asset/asset.model');
const StudentDocumentItem = require('../student-document/student-document.model');
const { FlashcardDeckItem } = require('../flashcard/flashcard.model');
const User = require('../account/account.auth.model');
const { AuditLog } = require('../../shared/audit-log');
const service = require('./admin-data.service');

const ALL_MODELS = [
  Concept,
  QuestionItem,
  AssessmentConfigItem,
  MasteryItem,
  AssessmentItem,
  WrongItem,
  StudentSubjectItem,
  PlanningItem,
  AssetItem,
  StudentDocumentItem,
  FlashcardDeckItem,
];

describe('admin-data.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ALL_MODELS.forEach((m) => {
      m.countDocuments = jest.fn().mockResolvedValue(0);
    });
  });

  describe('retentionStats', () => {
    it('sums active + archived per tracked collection from real countDocuments calls', async () => {
      Concept.countDocuments.mockImplementation((filter) =>
        filter && filter.deletedAt ? Promise.resolve(3) : Promise.resolve(10),
      );
      const stats = await service.retentionStats();
      const concept = stats.collections.find((c) => c.key === 'concept');
      expect(concept).toEqual({ key: 'concept', label: 'Khái niệm', active: 10, archived: 3, total: 13 });
      expect(stats.totals.archived).toBeGreaterThanOrEqual(3);
    });
  });

  describe('staleRecords', () => {
    it('lists abandoned in-progress assessments and stale archived rows, with no delete performed', async () => {
      AssessmentItem.find.mockReturnValue({
        select: () => ({
          populate: () => ({
            populate: () => ({
              sort: () => ({
                limit: () => ({
                  lean: () =>
                    Promise.resolve([
                      {
                        _id: 'a1',
                        owner: { email: 'student@navilearn.local', fullName: 'Học sinh Test' },
                        concept: { name: 'Vật chất' },
                        startedAt: new Date('2026-01-01'),
                      },
                    ]),
                }),
              }),
            }),
          }),
        }),
      });
      Concept.countDocuments.mockResolvedValue(2);
      const data = await service.staleRecords({ days: 30 });
      expect(data.abandonedAssessments).toHaveLength(1);
      expect(data.abandonedAssessments[0].owner.email).toBe('student@navilearn.local');
      expect(data.abandonedAssessments[0].conceptName).toBe('Vật chất');
      expect(data.staleArchived.find((r) => r.key === 'concept').count).toBe(2);
    });
  });

  describe('exportStudentData', () => {
    it('throws 404 when the student cannot be found', async () => {
      User.findOne.mockReturnValue({ select: () => Promise.resolve(null) });
      await expect(service.exportStudentData('nobody@navilearn.local')).rejects.toMatchObject({ status: 404 });
    });

    it('bundles only live (non-deleted) data for the found student', async () => {
      User.findOne.mockReturnValue({
        select: () => Promise.resolve({ _id: 'u1', email: 's@navilearn.local', fullName: 'S', createdAt: new Date() }),
      });
      MasteryItem.find.mockReturnValue({ populate: () => ({ lean: () => Promise.resolve([{ score: 80 }]) }) });
      WrongItem.find.mockReturnValue({ populate: () => ({ populate: () => ({ lean: () => Promise.resolve([]) }) }) });
      AssessmentItem.find.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
      StudentSubjectItem.find.mockReturnValue({ populate: () => ({ lean: () => Promise.resolve([]) }) });

      const bundle = await service.exportStudentData('s@navilearn.local');
      expect(bundle.student.email).toBe('s@navilearn.local');
      expect(bundle.mastery).toEqual([{ score: 80 }]);
      expect(MasteryItem.find).toHaveBeenCalledWith({ owner: 'u1', deletedAt: null });
    });
  });

  describe('recentDataActivity', () => {
    it('reads only import/export actions from the shared audit log', async () => {
      AuditLog.find.mockReturnValue({
        sort: () => ({ limit: () => ({ populate: () => ({ lean: () => Promise.resolve([]) }) }) }),
      });
      await service.recentDataActivity({ limit: 5 });
      expect(AuditLog.find).toHaveBeenCalledWith({
        action: { $in: ['knowledge.import', 'knowledge.export', 'question_bank.import', 'question_bank.export'] },
      });
    });
  });
});
