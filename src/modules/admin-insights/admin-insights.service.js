const mongoose = require('mongoose');
const MasteryItem = require('../mastery/mastery.model');
const AssessmentItem = require('../assessment/assessment.model');
const WrongItem = require('../wrong-item/wrong-item.model');
const Concept = require('../knowledge/knowledge.model');
const QuestionItem = require('../question-bank/question-bank.model');
const { toCsv } = require('../../utils/csv');

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// "Môn học" has no dedicated entity in this codebase — a top-level Concept (parentConcept = null)
// stands in for it (see student-subject.model.js). Resolve each concept's top-level ancestor once,
// in memory, since the concept tree is small (a handful of subjects, a few hundred nodes at most).
async function buildSubjectResolver() {
  const concepts = await Concept.find({}).select('_id name parentConcept').lean();
  const byId = new Map(concepts.map((c) => [String(c._id), c]));
  const rootCache = new Map();
  return function resolveSubject(conceptId) {
    const key = String(conceptId);
    if (rootCache.has(key)) return rootCache.get(key);
    let cursor = byId.get(key);
    const seen = new Set();
    while (cursor && cursor.parentConcept && !seen.has(String(cursor._id))) {
      seen.add(String(cursor._id));
      cursor = byId.get(String(cursor.parentConcept));
    }
    const root = cursor ?? null;
    rootCache.set(key, root);
    return root;
  };
}

async function listSubjects() {
  return Concept.find({ parentConcept: null }).select('_id name').sort({ order: 1, name: 1 }).lean();
}

// UC-RPT-01 "Hiệu quả học tập": goal completion, average Mastery, 7-day retention, and a per-subject
// breakdown — every number here is a real aggregate over MasteryItem/AssessmentItem, not a placeholder.
async function learningEffectivenessReport({ subjectId } = {}) {
  const resolveSubject = await buildSubjectResolver();
  const masteryItems = await MasteryItem.find({ deletedAt: null }).select('owner concept score goalScore').lean();

  const scoped = subjectId
    ? masteryItems.filter((m) => String(resolveSubject(m.concept)?._id) === String(subjectId))
    : masteryItems;

  const withGoal = scoped.filter((m) => m.goalScore != null);
  const goalCompletionRate = withGoal.length
    ? Math.round((withGoal.filter((m) => m.score >= m.goalScore).length / withGoal.length) * 100)
    : 0;
  const avgMasteryScore = scoped.length
    ? Math.round(scoped.reduce((sum, m) => sum + m.score, 0) / scoped.length)
    : 0;

  const since7d = new Date(Date.now() - SEVEN_DAYS_MS);
  const [activeEver, activeRecent] = await Promise.all([
    AssessmentItem.distinct('owner', { deletedAt: null, status: 'submitted' }),
    AssessmentItem.distinct('owner', { deletedAt: null, status: 'submitted', submittedAt: { $gte: since7d } }),
  ]);
  const retention7dRate = activeEver.length
    ? Math.round((activeRecent.length / activeEver.length) * 100)
    : 0;

  const bySubjectMap = new Map();
  scoped.forEach((m) => {
    const subject = resolveSubject(m.concept);
    if (!subject) return;
    const key = String(subject._id);
    if (!bySubjectMap.has(key)) {
      bySubjectMap.set(key, { subjectId: key, subjectName: subject.name, totalScore: 0, count: 0, learners: new Set() });
    }
    const bucket = bySubjectMap.get(key);
    bucket.totalScore += m.score;
    bucket.count += 1;
    bucket.learners.add(String(m.owner));
  });
  const bySubject = [...bySubjectMap.values()]
    .map((b) => ({
      subjectId: b.subjectId,
      subjectName: b.subjectName,
      avgScore: Math.round(b.totalScore / b.count),
      learnerCount: b.learners.size,
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  return {
    summary: { goalCompletionRate, avgMasteryScore, retention7dRate },
    bySubject,
  };
}

// UC-RPT-02 "Khối lượng luyện tập/kiểm tra": submitted attempts per day over the window, plus pass rate.
async function volumeReport({ days = 30 } = {}) {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const rows = await AssessmentItem.aggregate([
    { $match: { deletedAt: null, status: 'submitted', submittedAt: { $gte: since } } },
    {
      $group: {
        // UTC per the business doc's timezone rule (NaviLearn_01 §2) — stored and grouped in UTC.
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$submittedAt', timezone: 'UTC' } },
        attempts: { $sum: 1 },
        passed: { $sum: { $cond: ['$passed', 1, 0] } },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  const byDay = rows.map((r) => ({
    date: r._id,
    attempts: r.attempts,
    passRate: r.attempts ? Math.round((r.passed / r.attempts) * 100) : 0,
  }));
  const totalAttempts = byDay.reduce((sum, r) => sum + r.attempts, 0);
  const totalPassed = rows.reduce((sum, r) => sum + r.passed, 0);
  return {
    byDay,
    totalAttempts,
    overallPassRate: totalAttempts ? Math.round((totalPassed / totalAttempts) * 100) : 0,
  };
}

// UC-RPT-03 "Câu hỏi bị sai nhiều nhất": cross-student WrongItem aggregate — real signal for which
// questions/concepts need attention, reusing the same notebook data the student-facing wrong-items
// screen already tracks (wrong-item.model.js), just rolled up across everyone instead of per-owner.
async function topMissedQuestions({ limit = 20, concept } = {}) {
  const match = {
    deletedAt: null,
    status: 'open',
    ...(concept ? { concept: new mongoose.Types.ObjectId(concept) } : {}),
  };
  const rows = await WrongItem.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$question',
        totalWrongCount: { $sum: '$wrongCount' },
        studentCount: { $sum: 1 },
        concept: { $first: '$concept' },
      },
    },
    { $sort: { totalWrongCount: -1 } },
    { $limit: Math.max(1, Math.min(limit, 100)) },
  ]);
  if (!rows.length) return [];

  const questions = await QuestionItem.find({ _id: { $in: rows.map((r) => r._id) } })
    .select('text concept')
    .populate('concept', 'name')
    .lean();
  const questionById = new Map(questions.map((q) => [String(q._id), q]));

  return rows.map((r) => {
    const question = questionById.get(String(r._id));
    return {
      questionId: r._id,
      questionText: question?.text ?? '(Câu hỏi đã bị xoá)',
      conceptName: question?.concept?.name ?? null,
      totalWrongCount: r.totalWrongCount,
      studentCount: r.studentCount,
    };
  });
}

async function exportReportCsv(report, params) {
  if (report === 'learning-effectiveness') {
    const { bySubject } = await learningEffectivenessReport(params);
    return toCsv(bySubject, [
      { header: 'Môn học', value: (r) => r.subjectName },
      { header: 'Mastery trung bình', value: (r) => r.avgScore },
      { header: 'Số học viên', value: (r) => r.learnerCount },
    ]);
  }
  if (report === 'volume') {
    const { byDay } = await volumeReport(params);
    return toCsv(byDay, [
      { header: 'Ngày (UTC)', value: (r) => r.date },
      { header: 'Số lượt làm bài', value: (r) => r.attempts },
      { header: 'Tỉ lệ đạt (%)', value: (r) => r.passRate },
    ]);
  }
  if (report === 'top-missed') {
    const rows = await topMissedQuestions(params);
    return toCsv(rows, [
      { header: 'Câu hỏi', value: (r) => r.questionText },
      { header: 'Chủ đề', value: (r) => r.conceptName ?? '' },
      { header: 'Tổng lượt sai', value: (r) => r.totalWrongCount },
      { header: 'Số học viên từng sai', value: (r) => r.studentCount },
    ]);
  }
  return toCsv([], [{ header: 'Lỗi', value: () => 'Loại báo cáo không hợp lệ' }]);
}

module.exports = {
  listSubjects,
  learningEffectivenessReport,
  volumeReport,
  topMissedQuestions,
  exportReportCsv,
};
