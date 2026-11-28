// Full idempotent seed script for NaviLearn (Admin + Student full E2E dataset).
// Preserves all existing accounts & real data; safe to run multiple times.
// Usage: node scripts/seed-full.js
require('dotenv').config();
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/modules/account/account.auth.model');
const Concept = require('../src/modules/knowledge/knowledge.model');
const PersonalConcept = require('../src/modules/knowledge/knowledge.personal.model');
const ConceptNote = require('../src/modules/knowledge/knowledge.note.model');
const StudentSubjectItem = require('../src/modules/student-subject/student-subject.model');
const StudentDocumentItem = require('../src/modules/student-document/student-document.model');
const AssetItem = require('../src/modules/asset/asset.model');
const QuestionItem = require('../src/modules/question-bank/question-bank.model');
const QuestionIssueReport = require('../src/modules/question-bank/question-issue-report.model');
const LessonItem = require('../src/modules/lesson/lesson.model');
const PlanningGoal = require('../src/modules/planning/planning.goal.model');
const PlanningItem = require('../src/modules/planning/planning.model');
const MasteryItem = require('../src/modules/mastery/mastery.model');
const WrongItem = require('../src/modules/wrong-item/wrong-item.model');
const SupportItem = require('../src/modules/support/support.model');
const ReviewItem = require('../src/modules/review/review.model');
const AdminReportItem = require('../src/modules/admin-report/admin-report.model');
const NotificationItem = require('../src/modules/notification/notification.model');
const AiAssistItem = require('../src/modules/ai-assist/ai-assist.model');
const { ROLES } = require('../src/shared/roles');

const ADMIN_EMAIL = 'admin@navilearn.local';
const STUDENT_EMAIL = 'student@navilearn.local';

function dayShift(days, hour = 19) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

async function main() {
  await connectDB();

  const admin = await User.findOne({ email: ADMIN_EMAIL, role: ROLES.ADMIN });
  const student = await User.findOne({ email: STUDENT_EMAIL, role: ROLES.STUDENT });
  if (!admin || !student) {
    throw new Error('Không tìm thấy tài khoản admin@navilearn.local hoặc student@navilearn.local');
  }

  const todayStr = new Date().toISOString().slice(0, 10);

  // 1. Streak & Badges for student (v2.1 §5.9)
  const existingStreak = student.streak?.current ?? 0;
  if (existingStreak < 7) {
    student.streak = {
      current: 7,
      longest: Math.max(student.streak?.longest ?? 0, 14),
      lastActiveDate: todayStr,
    };
  }
  const badgeCodes = new Set((student.badges || []).map((b) => b.code));
  const defaultBadges = [
    { code: 'STREAK_3', name: 'Khởi động bền bỉ', thresholdDays: 3, earnedAt: dayShift(-4) },
    { code: 'STREAK_7', name: 'Tuần lễ vàng', thresholdDays: 7, earnedAt: new Date() },
  ];
  for (const b of defaultBadges) {
    if (!badgeCodes.has(b.code)) {
      student.badges.push(b);
    }
  }
  await student.save();

  // 2. Resolve real subjects & leaf concepts
  const rootConcepts = await Concept.find({ parentConcept: null, status: 'active' }).sort({ order: 1 }).limit(10);
  const triet = rootConcepts.find((c) => c.name.includes('Triết học')) || rootConcepts[0];
  const giaiTich = rootConcepts.find((c) => c.name.includes('Giải tích')) || rootConcepts[1] || triet;
  const daiSo = rootConcepts.find((c) => c.name.includes('Đại số')) || rootConcepts[2] || triet;

  const leafConcepts = await Concept.find({ parentConcept: { $ne: null }, status: 'active' }).limit(30);
  const activeQuestions = await QuestionItem.find({ status: 'active', type: { $in: ['mcq', 'true_false'] } })
    .limit(30)
    .lean();
  const activeAssets = await AssetItem.find({ status: 'active' }).limit(5).lean();
  const publishedLessons = await LessonItem.find({ status: 'published' }).limit(10).lean();

  // Ensure prerequisite/related edges exist between first few leaf concepts for Knowledge Map & Stage Inspector
  if (leafConcepts.length >= 4) {
    if (!leafConcepts[1].prerequisites?.length) {
      leafConcepts[1].prerequisites = [leafConcepts[0]._id];
      leafConcepts[1].related = [leafConcepts[2]._id];
      await leafConcepts[1].save();
    }
    if (!leafConcepts[2].prerequisites?.length) {
      leafConcepts[2].prerequisites = [leafConcepts[1]._id];
      leafConcepts[2].related = [leafConcepts[3]._id];
      await leafConcepts[2].save();
    }
  }

  // 3. Student Subjects (3 catalog + 1 custom)
  for (const [idx, subj] of [triet, giaiTich, daiSo].entries()) {
    if (!subj) continue;
    const exists = await StudentSubjectItem.findOne({ owner: student._id, concept: subj._id });
    if (!exists) {
      await StudentSubjectItem.create({
        owner: student._id,
        createdBy: student._id,
        concept: subj._id,
        pinned: idx === 0,
        displayOrder: idx,
      });
    }
  }
  const customSubjTitle = 'Tiếng Anh chuyên ngành CNTT';
  if (!(await StudentSubjectItem.findOne({ owner: student._id, customTitle: customSubjTitle }))) {
    await StudentSubjectItem.create({
      owner: student._id,
      createdBy: student._id,
      customTitle: customSubjTitle,
      customDescription: 'Môn cá nhân tự tổng hợp từ vựng và tài liệu đọc hiểu chuyên ngành.',
      customColor: '#4A89DC',
      pinned: false,
      displayOrder: 3,
    });
  }

  // 4. Student Personal Documents (with v2.1 doc_analysis READY metadata)
  const docSpecs = [
    {
      title: 'Đề cương ôn thi Triết học Mác – Lênin (HK1)',
      documentRole: 'SYLLABUS',
      originalName: 'de-cuong-triet-hoc.pdf',
      concept: triet?._id ?? null,
      tags: ['Triết học', 'Đề cương'],
      detectedTopics: ['Vật chất và ý thức', 'Phép biện chứng duy vật', 'Lý luận nhận thức'],
      extractedSummary: 'Tổng hợp phạm vi 3 chương trọng tâm ôn thi cuối kỳ môn Triết học Mác – Lênin.',
    },
    {
      title: 'Slide bài giảng Chương 2 - Thế giới quan duy vật',
      documentRole: 'SLIDES',
      originalName: 'slide-chuong-2-duy-vat.pdf',
      concept: triet?._id ?? null,
      tags: ['Chương 2', 'Slide'],
      detectedTopics: ['Vật chất', 'Nguồn gốc ý thức', 'Bản chất ý thức'],
      extractedSummary: 'Slide tóm tắt định nghĩa vật chất của Lênin, nguồn gốc tự nhiên và xã hội của ý thức.',
    },
    {
      title: 'Tuyển tập đề thi cuối kỳ Triết học các năm trước',
      documentRole: 'PAST_EXAM',
      originalName: 'de-thi-cu-triet-hoc.pdf',
      concept: triet?._id ?? null,
      tags: ['Đề thi cũ', 'Ôn tập'],
      detectedTopics: ['Quy luật mâu thuẫn', 'Thực tiễn và nhận thức'],
      extractedSummary: 'Bộ 5 đề thi tham khảo có cấu trúc 60% trắc nghiệm, 40% tự luận.',
    },
    {
      title: 'Giáo trình Giải tích 1 tóm tắt công thức',
      documentRole: 'TEXTBOOK',
      originalName: 'giao-trinh-giai-tich-1.pdf',
      concept: giaiTich?._id ?? null,
      tags: ['Giải tích 1', 'Công thức'],
      detectedTopics: ['Giới hạn hàm số', 'Đạo hàm', 'Tích phân'],
      extractedSummary: 'Tổng hợp các định lý và bảng công thức đạo hàm, tích phân cơ bản.',
    },
  ];
  const seededDocs = [];
  for (const spec of docSpecs) {
    let doc = await StudentDocumentItem.findOne({ owner: student._id, title: spec.title });
    if (!doc) {
      doc = await StudentDocumentItem.create({
        owner: student._id,
        createdBy: student._id,
        title: spec.title,
        documentRole: spec.documentRole,
        fileUrl: `/uploads/student-documents/${spec.originalName}`,
        originalName: spec.originalName,
        mimeType: 'application/pdf',
        sizeBytes: 512 * 1024,
        description: spec.extractedSummary,
        tags: spec.tags,
        concept: spec.concept,
        processingStatus: 'READY',
        extractedSummary: spec.extractedSummary,
        detectedTopics: spec.detectedTopics,
        suggestedConcepts: leafConcepts.slice(0, 3).map((c) => c._id),
        analyzedAt: new Date(),
      });
    }
    seededDocs.push(doc);
  }

  // 5. Exam Goals across all lifecycle states (active, paused, completed)
  const activeGoalTitle = 'Chinh phục 8.5 điểm Triết học Mác – Lênin — Cuối kỳ';
  let activeGoal = await PlanningGoal.findOne({ owner: student._id, title: activeGoalTitle });
  if (!activeGoal) {
    activeGoal = await PlanningGoal.create({
      owner: student._id,
      createdBy: student._id,
      status: 'active',
      concept: triet._id,
      title: activeGoalTitle,
      examName: 'Cuối kỳ',
      targetScore: 8.5,
      importance: 5,
      startDate: dayShift(-3, 0),
      deadline: dayShift(14, 0),
      studyDays: 14,
      minutesPerDay: 90,
      restDays: [0],
      examFormat: 'Trắc nghiệm + Tự luận',
      examScope: 'Chương 1, 2, 3 Giáo trình Triết học Mác – Lênin',
      selfReportedScore: 6.5,
      documentIds: seededDocs.slice(0, 3).map((d) => d._id),
      assetIds: activeAssets.slice(0, 2).map((a) => a._id),
      activatedAt: dayShift(-3, 0),
    });
  }

  const pausedGoalTitle = 'Ôn tập 8.0 điểm Giải tích 1 — Giữa kỳ';
  let pausedGoal = await PlanningGoal.findOne({ owner: student._id, title: pausedGoalTitle });
  if (!pausedGoal) {
    pausedGoal = await PlanningGoal.create({
      owner: student._id,
      createdBy: student._id,
      status: 'paused',
      concept: giaiTich._id,
      title: pausedGoalTitle,
      examName: 'Giữa kỳ',
      targetScore: 8.0,
      importance: 4,
      startDate: dayShift(-5, 0),
      deadline: dayShift(20, 0),
      studyDays: 20,
      minutesPerDay: 60,
      restDays: [0],
      pauseReason: 'Tạm nghỉ tập trung thi cuối kỳ Triết học',
      pausedAt: dayShift(-1, 0),
      activatedAt: dayShift(-5, 0),
    });
  }

  const completedGoalTitle = 'Chinh phục 8.0 điểm Đại số tuyến tính — Cuối kỳ';
  if (!(await PlanningGoal.findOne({ owner: student._id, title: completedGoalTitle }))) {
    await PlanningGoal.create({
      owner: student._id,
      createdBy: student._id,
      status: 'completed',
      concept: daiSo._id,
      title: completedGoalTitle,
      examName: 'Cuối kỳ',
      targetScore: 8.0,
      importance: 4,
      startDate: dayShift(-25, 0),
      deadline: dayShift(-5, 0),
      studyDays: 18,
      minutesPerDay: 75,
      examResultScore: 8.5,
      closingNote: 'Hoàn thành trọn vẹn các chặng và vượt mục tiêu 0.5 điểm.',
      activatedAt: dayShift(-25, 0),
      closedAt: dayShift(-4, 0),
    });
  }

  // 6. Rich multi-chapter Active Plan (for 3-panel LearningRoadmap + Today + LessonPlayer)
  const fullPlanTitle = 'Lộ trình ôn thi Triết học Mác – Lênin (3 Chương)';
  let fullPlan = await PlanningItem.findOne({ owner: student._id, title: fullPlanTitle });
  if (!fullPlan) {
    // Supersede older demo active plans for clean display while keeping history intact
    await PlanningItem.updateMany(
      { owner: student._id, status: 'active' },
      { $set: { status: 'superseded' } },
    );
    const qSlice = (start) => activeQuestions.slice(start, start + 3).map((q) => q._id);
    const cAt = (idx) => (leafConcepts[idx] || triet)._id;
    const lAt = (idx) => publishedLessons[idx]?._id ?? null;

    fullPlan = await PlanningItem.create({
      owner: student._id,
      createdBy: student._id,
      title: fullPlanTitle,
      status: 'active',
      goal: activeGoal._id,
      sessions: [
        {
          concept: cAt(0),
          startAt: dayShift(-3, 19),
          durationMin: 60,
          status: 'done',
          quizPassed: true,
          chapterTitle: 'Chương 1: Nhập môn Triết học',
          title: 'Khái luận về Triết học và vấn đề cơ bản',
          objectives: [
            'Trình bày được nguồn gốc nhận thức và nguồn gốc xã hội của Triết học',
            'Phân biệt được chủ nghĩa duy vật và chủ nghĩa duy tâm',
          ],
          theoryContent: JSON.stringify([
            { type: 'heading', content: 'Nguồn gốc và đối tượng của Triết học' },
            { type: 'text', content: 'Triết học ra đời vào khoảng thế kỷ VIII - VI TCN tại cả phương Đông và phương Tây.' },
            { type: 'heading', content: 'Vấn đề cơ bản của Triết học' },
            { type: 'text', content: 'Mối quan hệ giữa vật chất và ý thức gồm hai mặt: bản thể luận và nhận thức luận.' },
          ]),
          questions: qSlice(0),
          lessonId: lAt(0),
        },
        {
          concept: cAt(1),
          startAt: dayShift(-2, 19),
          durationMin: 75,
          status: 'done',
          quizPassed: true,
          chapterTitle: 'Chương 1: Nhập môn Triết học',
          title: 'Sự ra đời và phát triển của Triết học Mác – Lênin',
          objectives: ['Nắm vững 3 tiền đề lý luận của Triết học Mác', 'Hiểu vai trò của giai đoạn Lênin'],
          theoryContent: JSON.stringify([
            { type: 'heading', content: 'Điều kiện kinh tế - xã hội và tiền đề lý luận' },
            { type: 'text', content: 'Triết học cổ điển Đức, Kinh tế chính trị học cổ điển Anh và Chủ nghĩa xã hội không tưởng Pháp.' },
          ]),
          questions: qSlice(3),
          lessonId: lAt(1),
        },
        {
          concept: cAt(2),
          startAt: dayShift(-1, 19),
          durationMin: 90,
          status: 'missed',
          quizPassed: false,
          chapterTitle: 'Chương 2: Thế giới quan duy vật',
          title: 'Vật chất và các hình thức tồn tại của vật chất',
          objectives: ['Phân tích định nghĩa vật chất của V.I. Lênin', 'Hiểu vận động, không gian và thời gian'],
          theoryContent: JSON.stringify([
            { type: 'heading', content: 'Định nghĩa vật chất của V.I. Lênin' },
            { type: 'text', content: 'Vật chất là một phạm trù triết học dùng để chỉ thực tại khách quan được đem lại cho con người trong cảm giác.' },
            { type: 'heading', content: 'Phương thức và hình thức tồn tại của vật chất' },
            { type: 'text', content: 'Vận động là phương thức tồn tại của vật chất; không gian và thời gian là hình thức tồn tại của vật chất.' },
          ]),
          questions: qSlice(6),
          lessonId: lAt(2),
        },
        {
          concept: cAt(3),
          startAt: dayShift(0, 19),
          durationMin: 90,
          status: 'planned',
          quizPassed: false,
          chapterTitle: 'Chương 2: Thế giới quan duy vật',
          title: 'Nguồn gốc, bản chất và kết cấu của ý thức',
          objectives: [
            'Phân biệt nguồn gốc tự nhiên và nguồn gốc xã hội của ý thức',
            'Hiểu bản chất phản ánh năng động, sáng tạo của ý thức',
          ],
          theoryContent: JSON.stringify([
            { type: 'heading', content: 'Nguồn gốc tự nhiên và xã hội của ý thức' },
            { type: 'text', content: 'Bộ óc người cùng thế giới khách quan là nguồn gốc tự nhiên; lao động và ngôn ngữ là nguồn gốc xã hội quyết định.' },
            { type: 'heading', content: 'Bản chất và kết cấu của ý thức' },
            { type: 'text', content: 'Ý thức là hình ảnh chủ quan của thế giới khách quan, bao gồm tri thức, tình cảm, ý chí.' },
          ]),
          questions: qSlice(9),
          lessonId: lAt(3),
        },
        {
          concept: cAt(4),
          startAt: dayShift(1, 19),
          durationMin: 75,
          status: 'planned',
          quizPassed: false,
          chapterTitle: 'Chương 2: Thế giới quan duy vật',
          title: 'Mối quan hệ biện chứng giữa vật chất và ý thức',
          objectives: ['Rút ra ý nghĩa phương pháp luận: tôn trọng tính khách quan kết hợp phát huy tính năng động chủ quan'],
          theoryContent: JSON.stringify([
            { type: 'heading', content: 'Vai trò quyết định của vật chất đối với ý thức' },
            { type: 'text', content: 'Vật chất quyết định nguồn gốc, nội dung, bản chất và sự vận động, phát triển của ý thức.' },
          ]),
          questions: qSlice(12),
          lessonId: lAt(4),
        },
        {
          concept: cAt(5),
          startAt: dayShift(2, 19),
          durationMin: 90,
          status: 'planned',
          quizPassed: false,
          chapterTitle: 'Chương 3: Phép biện chứng duy vật',
          title: 'Hai nguyên lý cơ bản của phép biện chứng duy vật',
          objectives: ['Vận dụng quan điểm toàn diện, lịch sử - cụ thể và quan điểm phát triển'],
          theoryContent: JSON.stringify([
            { type: 'heading', content: 'Nguyên lý về mối liên hệ phổ biến' },
            { type: 'text', content: 'Mọi sự vật, hiện tượng đều tồn tại trong mối liên hệ tác động qua lại lẫn nhau.' },
          ]),
          questions: qSlice(15),
          lessonId: lAt(5),
        },
        {
          concept: cAt(6),
          startAt: dayShift(3, 19),
          durationMin: 90,
          status: 'planned',
          quizPassed: false,
          chapterTitle: 'Chương 3: Phép biện chứng duy vật',
          title: 'Ba quy luật cơ bản và tổng ôn thi thử',
          objectives: ['Phân tích quy luật lượng - chất, quy luật mâu thuẫn, quy luật phủ định của phủ định'],
          theoryContent: JSON.stringify([
            { type: 'heading', content: 'Ba quy luật cơ bản của phép biện chứng duy vật' },
            { type: 'text', content: 'Chỉ ra cách thức, nguồn gốc động lực và khuynh hướng vận động, phát triển của sự vật.' },
          ]),
          questions: qSlice(18),
          lessonId: lAt(6),
        },
      ],
    });
  }

  // Also seed 1 proposed plan for BR-37/54 confirmation testing
  const proposedTitle = 'Đề xuất ôn tập Giải tích 1 (AI thích ứng)';
  if (!(await PlanningItem.findOne({ owner: student._id, title: proposedTitle }))) {
    await PlanningItem.create({
      owner: student._id,
      createdBy: student._id,
      title: proposedTitle,
      status: 'proposed',
      goal: pausedGoal._id,
      reason: 'Đề xuất phân bổ lại 2 buổi trọng tâm theo quỹ 60 phút/ngày (BR-37/54).',
      sessions: [
        {
          concept: (leafConcepts[7] || giaiTich)._id,
          startAt: dayShift(4, 19),
          durationMin: 60,
          status: 'planned',
          chapterTitle: 'Chương 1: Giới hạn & Liên tục',
          title: 'Ôn tập giới hạn hàm số và vô cùng bé',
          objectives: ['Tính được giới hạn dạng vô định 0/0 bằng L-Hospital và VCB tương đương'],
          questions: activeQuestions.slice(0, 2).map((q) => q._id),
        },
      ],
    });
  }

  // 7. Mastery items spanning all 5 Learning States (with history trends)
  const masteryConfigs = [
    { idx: 0, score: 92, level: 'mastered', state: 'APPLIED', attempts: 5, correct: 4 },
    { idx: 1, score: 82, level: 'proficient', state: 'UNDERSTOOD', attempts: 4, correct: 3 },
    { idx: 2, score: 62, level: 'developing', state: 'PRACTICING', attempts: 3, correct: 2 },
    { idx: 3, score: 38, level: 'novice', state: 'LEARNING', attempts: 2, correct: 1 },
    { idx: 4, score: 54, level: 'developing', state: 'DECAY_RISK', attempts: 3, correct: 2 },
    { idx: 5, score: 76, level: 'proficient', state: 'UNDERSTOOD', attempts: 4, correct: 3 },
  ];
  for (const cfg of masteryConfigs) {
    const c = leafConcepts[cfg.idx];
    if (!c) continue;
    const exists = await MasteryItem.findOne({ owner: student._id, concept: c._id });
    if (!exists) {
      await MasteryItem.create({
        owner: student._id,
        createdBy: student._id,
        concept: c._id,
        score: cfg.score,
        level: cfg.level,
        learningState: cfg.state,
        attemptsCount: cfg.attempts,
        correctCount: cfg.correct,
        lastAttemptAt: dayShift(-cfg.idx, 18),
        goalScore: 85,
        history: [
          { score: Math.max(15, cfg.score - 25), level: 'novice', reason: 'placement_init', evidenceType: 'placement', at: dayShift(-10) },
          { score: Math.max(25, cfg.score - 10), level: 'developing', reason: 'initial_grading', evidenceType: 'practice', at: dayShift(-5) },
          { score: cfg.score, level: cfg.level, reason: 'initial_grading', evidenceType: 'chapter_test', at: dayShift(-1) },
        ],
      });
    }
  }

  // 8. Wrong items (3 open + 1 mastered)
  for (let i = 0; i < Math.min(4, activeQuestions.length); i += 1) {
    const q = activeQuestions[i];
    const exists = await WrongItem.findOne({ owner: student._id, question: q._id });
    if (!exists) {
      await WrongItem.create({
        owner: student._id,
        createdBy: student._id,
        question: q._id,
        concept: q.concept,
        wrongCount: i === 0 ? 3 : i + 1,
        lastWrongAt: dayShift(-i, 20),
        status: i === 3 ? 'mastered' : 'open',
      });
    }
  }

  // 9. Personal Concept Notes (including [Cần ôn])
  const personalNodes = await PersonalConcept.find({ owner: student._id }).limit(3);
  const noteTexts = [
    '[Cần ôn] Nhớ kỹ 2 mặt của vấn đề cơ bản Triết học: bản thể luận và nhận thức luận.',
    'Phân biệt rõ nguồn gốc tự nhiên (bộ óc + thế giới khách quan) và nguồn gốc xã hội (lao động + ngôn ngữ).',
    '[Cần ôn] Quy luật lượng - chất: độ, điểm nút và bước nhảy.',
  ];
  for (let i = 0; i < personalNodes.length; i += 1) {
    const exists = await ConceptNote.findOne({ owner: student._id, personalConcept: personalNodes[i]._id });
    if (!exists) {
      await ConceptNote.create({
        owner: student._id,
        createdBy: student._id,
        personalConcept: personalNodes[i]._id,
        content: noteTexts[i],
      });
    }
  }

  // 10. Admin & Student Ops: Question Issue Reports, Support, Reviews, Admin Reports, Notifications, AI Logs
  if (activeQuestions.length >= 2) {
    const rep1Title = 'Đáp án B và C có nội dung khá giống nhau, dễ gây nhầm lẫn.';
    if (!(await QuestionIssueReport.findOne({ reportedBy: student._id, description: rep1Title }))) {
      await QuestionIssueReport.create({
        question: activeQuestions[0]._id,
        reportedBy: student._id,
        createdBy: student._id,
        reason: 'unclear',
        description: rep1Title,
        status: 'open',
      });
    }
    const rep2Title = 'Lỗi chính tả ở từ "duy vật biện chứng" trong đề bài.';
    if (!(await QuestionIssueReport.findOne({ reportedBy: student._id, description: rep2Title }))) {
      await QuestionIssueReport.create({
        question: activeQuestions[1]._id,
        reportedBy: student._id,
        createdBy: student._id,
        reason: 'typo',
        description: rep2Title,
        status: 'resolved',
        resolution: 'Đã chuẩn hóa lại chính tả câu hỏi.',
        resolvedBy: String(admin._id),
        resolvedAt: dayShift(-1),
        reply: 'Cảm ơn bạn đã báo lỗi, nội dung câu hỏi đã được cập nhật chính xác.',
        repliedBy: admin._id,
        repliedAt: dayShift(-1),
      });
    }
  }

  const supportSpecs = [
    {
      title: 'Hỏi về cách đồng bộ lịch ôn thi sang Google Calendar',
      content: 'Em muốn xuất lịch học từng ngày từ màn Hôm nay sang lịch cá nhân thì thao tác ở đâu ạ?',
      status: 'open',
    },
    {
      title: 'Không tải được file PDF đề cương 18MB',
      content: 'Em tải file PDF đề cương lên mục Tài liệu của tôi bị chậm, nhờ Admin kiểm tra giúp.',
      status: 'resolved',
    },
  ];
  for (const s of supportSpecs) {
    if (!(await SupportItem.findOne({ owner: student._id, title: s.title }))) {
      await SupportItem.create({ owner: student._id, createdBy: student._id, ...s });
    }
  }

  const reviewSpecs = [
    {
      title: 'Giao diện lộ trình 3 cột rất trực quan và dễ theo dõi',
      content: 'Mình thích cách chia giáo trình bên trái, dòng tiến trình chặng ở giữa và chi tiết bài học bên phải.',
      rating: 5,
      category: 'lo_trinh',
      status: 'resolved',
    },
    {
      title: 'Đề xuất thêm bộ đếm giờ cho chế độ Câu hỏi nhanh',
      content: 'Chế độ Câu hỏi nhanh 5 câu rất hay, nếu có thêm đồng hồ đếm ngược sẽ tạo áp lực ôn thi tốt hơn.',
      rating: 4,
      category: 'luyen_tap',
      status: 'open',
    },
  ];
  for (const r of reviewSpecs) {
    if (!(await ReviewItem.findOne({ owner: student._id, title: r.title }))) {
      await ReviewItem.create({ owner: student._id, createdBy: student._id, ...r });
    }
  }

  const incidentSpecs = [
    {
      title: 'Hiển thị biểu đồ Mastery bị hẹp trên màn hình nhỏ',
      content: 'Khi thu nhỏ cửa sổ trình duyệt, nhãn trục X hơi sát nhau.',
      issueType: 'display_bug',
      location: '/student/mastery',
      status: 'open',
    },
    {
      title: 'Báo lỗi trùng câu hỏi trong đề luyện tập Chương 1',
      content: 'Câu hỏi về vấn đề cơ bản của Triết học xuất hiện 2 lần trong cùng một đề.',
      issueType: 'question_error',
      location: '/student/practice',
      status: 'resolved',
      adminResponse: 'Đã rà soát và loại bỏ câu hỏi trùng lặp trong bộ đề Chương 1.',
      respondedBy: admin._id,
      respondedAt: dayShift(-2),
    },
  ];
  for (const inc of incidentSpecs) {
    if (!(await AdminReportItem.findOne({ owner: student._id, title: inc.title }))) {
      await AdminReportItem.create({ owner: student._id, createdBy: student._id, ...inc });
    }
  }

  const notifSpecs = [
    {
      title: 'Chúc mừng bạn đạt huy hiệu Tuần lễ vàng (7 ngày liên tiếp)!',
      content: 'Bạn đã duy trì chuỗi 7 ngày học tập liên tục. Hãy giữ vững phong độ nhé!',
      category: 'hoc_tap',
      link: '/student/learning-roadmap',
      isRead: false,
    },
    {
      title: 'Nhắc nhở: Bạn có 1 buổi học hôm nay cần hoàn thành',
      content: 'Chặng 2.2: Nguồn gốc, bản chất và kết cấu của ý thức (90 phút) đang chờ bạn.',
      category: 'hoc_tap',
      link: '/student/today',
      isRead: false,
    },
  ];
  for (const n of notifSpecs) {
    if (!(await NotificationItem.findOne({ owner: student._id, title: n.title }))) {
      await NotificationItem.create({ owner: student._id, createdBy: admin._id, ...n });
    }
  }

  if ((await AiAssistItem.countDocuments({ owner: student._id })) < 4) {
    const aiLogs = [
      {
        kind: 'qa',
        prompt: 'Phân biệt vật chất với tư cách phạm trù triết học và vật chất trong vật lý học?',
        response: 'Vật chất trong triết học chỉ thực tại khách quan nói chung (vô hạn, vĩnh viễn), còn vật lý học nghiên cứu các dạng tồn tại cụ thể của vật chất.',
      },
      {
        kind: 'explain_wrong',
        prompt: 'Giải thích vì sao lao động là nhân tố quyết định sự hình thành ý thức?',
        response: 'Lao động giúp cải tạo tự nhiên, hoàn thiện bộ óc con người và làm nảy sinh nhu cầu giao tiếp bằng ngôn ngữ.',
      },
    ];
    for (const log of aiLogs) {
      if (!(await AiAssistItem.findOne({ owner: student._id, prompt: log.prompt }))) {
        await AiAssistItem.create({
          owner: student._id,
          createdBy: student._id,
          concept: leafConcepts[0]?._id ?? triet._id,
          ...log,
        });
      }
    }
  }

  // Print summary counts
  const summary = {
    users: await User.countDocuments(),
    concepts: await Concept.countDocuments(),
    studentSubjects: await StudentSubjectItem.countDocuments({ owner: student._id }),
    studentDocuments: await StudentDocumentItem.countDocuments({ owner: student._id, status: 'active' }),
    assets: await AssetItem.countDocuments({ status: 'active' }),
    lessons: await LessonItem.countDocuments({ status: 'published' }),
    questions: await QuestionItem.countDocuments({ status: 'active' }),
    planningGoals: await PlanningGoal.countDocuments({ owner: student._id }),
    planningItems: await PlanningItem.countDocuments({ owner: student._id }),
    masteryItems: await MasteryItem.countDocuments({ owner: student._id }),
    wrongItems: await WrongItem.countDocuments({ owner: student._id }),
    conceptNotes: await ConceptNote.countDocuments({ owner: student._id }),
    questionIssueReports: await QuestionIssueReport.countDocuments(),
    supportItems: await SupportItem.countDocuments(),
    reviewItems: await ReviewItem.countDocuments(),
    adminReportItems: await AdminReportItem.countDocuments(),
    notifications: await NotificationItem.countDocuments({ owner: student._id }),
    aiAssistItems: await AiAssistItem.countDocuments(),
  };

  console.log('\n=== FULL SEED COMPLETED (IDEMPOTENT) ===');
  for (const [k, v] of Object.entries(summary)) {
    console.log(`${k.padEnd(24)}: ${v}`);
  }
  await disconnectDB();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
