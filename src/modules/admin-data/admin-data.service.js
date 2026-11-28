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
const ApiError = require('../../utils/ApiError');
const { AuditLog } = require('../../shared/audit-log');

// Key collections this dashboard reports on — all plugin-backed with soft delete (BR per
// NaviLearn_01 §2: "không xóa cứng nội dung đã có người dùng — chuyển ARCHIVED/INACTIVE"), so
// `deletedAt` already carries real archival state instead of a hard DELETE.
const TRACKED_COLLECTIONS = [
  { key: 'concept', label: 'Khái niệm', model: Concept },
  { key: 'question', label: 'Câu hỏi', model: QuestionItem },
  { key: 'assessmentConfig', label: 'Cấu hình đề bài', model: AssessmentConfigItem },
  { key: 'mastery', label: 'Mastery', model: MasteryItem },
  { key: 'assessment', label: 'Bài làm/kiểm tra', model: AssessmentItem },
  { key: 'wrongItem', label: 'Câu sai (sổ ghi chú)', model: WrongItem },
  { key: 'studentSubject', label: 'Môn học của học viên', model: StudentSubjectItem },
  { key: 'planning', label: 'Kế hoạch học tập', model: PlanningItem },
  { key: 'asset', label: 'Tài liệu/tài nguyên', model: AssetItem },
  { key: 'studentDocument', label: 'Tài liệu cá nhân học viên', model: StudentDocumentItem },
  { key: 'flashcardDeck', label: 'Bộ flashcard', model: FlashcardDeckItem },
];

// UC-DAT-01: counts of active vs. soft-deleted (archived) rows per key collection. The soft-delete
// plugin excludes `deletedAt != null` from default find/count, so counting it back in needs the
// explicit filter below (same shape as every other admin-facing aggregate in this codebase).
async function retentionStats() {
  const rows = await Promise.all(
    TRACKED_COLLECTIONS.map(async ({ key, label, model }) => {
      const [active, archived] = await Promise.all([
        model.countDocuments({}),
        model.countDocuments({ deletedAt: { $ne: null } }),
      ]);
      return { key, label, active, archived, total: active + archived };
    }),
  );
  return {
    collections: rows,
    totals: rows.reduce(
      (acc, r) => ({ active: acc.active + r.active, archived: acc.archived + r.archived }),
      { active: 0, archived: 0 },
    ),
  };
}

// UC-DAT-02: real test-data pollution this session kept running into — abandoned practice/test
// attempts nobody ever submitted, and soft-deleted rows sitting well past any plausible review
// window. Informational only: no bulk/hard delete here (see module docstring in the routes file).
async function staleRecords({ days = 30 } = {}) {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const abandonedAssessments = await AssessmentItem.find({
    deletedAt: null,
    status: 'in_progress',
    startedAt: { $lte: cutoff },
  })
    .select('owner concept startedAt')
    .populate('owner', 'email fullName')
    .populate('concept', 'name')
    .sort({ startedAt: 1 })
    .limit(50)
    .lean();

  const staleArchived = await Promise.all(
    TRACKED_COLLECTIONS.map(async ({ key, label, model }) => {
      const count = await model.countDocuments({ deletedAt: { $ne: null, $lte: cutoff } });
      return { key, label, count };
    }),
  );

  return {
    cutoffDays: days,
    abandonedAssessments: abandonedAssessments.map((a) => ({
      id: a._id,
      owner: a.owner ? { email: a.owner.email, fullName: a.owner.fullName } : null,
      conceptName: a.concept?.name ?? null,
      startedAt: a.startedAt,
    })),
    staleArchived: staleArchived.filter((r) => r.count > 0),
  };
}

// UC-DAT-03: a real admin-triggered data export for one student — Mastery, WrongItem notebook,
// assessment history, and subject list, all live (non-deleted) data. JSON, not CSV: the shapes
// differ per collection, so one flat table would lose structure a JSON bundle keeps.
async function exportStudentData(studentIdOrEmail) {
  const user = await User.findOne(
    /^[a-f\d]{24}$/i.test(studentIdOrEmail) ? { _id: studentIdOrEmail } : { email: studentIdOrEmail.toLowerCase() },
  ).select('email fullName role createdAt');
  if (!user) throw ApiError.notFound('Không tìm thấy học viên');

  const [mastery, wrongItems, assessments, subjects] = await Promise.all([
    MasteryItem.find({ owner: user._id, deletedAt: null }).populate('concept', 'name').lean(),
    WrongItem.find({ owner: user._id, deletedAt: null }).populate('question', 'text').populate('concept', 'name').lean(),
    AssessmentItem.find({ owner: user._id, deletedAt: null })
      .select('concept status score passed startedAt submittedAt')
      .lean(),
    StudentSubjectItem.find({ owner: user._id, deletedAt: null }).populate('concept', 'name').lean(),
  ]);

  return {
    exportedAt: new Date().toISOString(),
    student: { id: user._id, email: user.email, fullName: user.fullName, memberSince: user.createdAt },
    mastery,
    wrongItems,
    assessments,
    subjects,
  };
}

// UC-DAT-04: "Lịch sử" — real import/export actions, read from the BR-29 audit log (previously
// written but never read back anywhere in the app; this is its first real consumer).
async function recentDataActivity({ limit = 20 } = {}) {
  const actions = ['knowledge.import', 'knowledge.export', 'question_bank.import', 'question_bank.export'];
  const logs = await AuditLog.find({ action: { $in: actions } })
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(limit, 100)))
    .populate('actor', 'email fullName')
    .lean();
  return logs.map((l) => ({
    id: l._id,
    action: l.action,
    actor: l.actor ? { email: l.actor.email, fullName: l.actor.fullName } : null,
    meta: l.meta,
    createdAt: l.createdAt,
  }));
}

module.exports = { TRACKED_COLLECTIONS, retentionStats, staleRecords, exportStudentData, recentDataActivity };
