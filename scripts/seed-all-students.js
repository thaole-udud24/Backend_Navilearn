// Idempotent Full Seed for ALL Student Accounts in NaviLearn + Knowledge Graph Related Edges
// Usage: node scripts/seed-all-students.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/modules/account/account.auth.model');
const Concept = require('../src/modules/knowledge/knowledge.model');
const knowledgeService = require('../src/modules/knowledge/knowledge.service');
const StudentSubjectItem = require('../src/modules/student-subject/student-subject.model');
const StudentDocumentItem = require('../src/modules/student-document/student-document.model');
const QuestionItem = require('../src/modules/question-bank/question-bank.model');
const { FlashcardDeckItem, FlashcardItem } = require('../src/modules/flashcard/flashcard.model');
const CardState = require('../src/modules/flashcard/card-state.model');
const PlanningGoal = require('../src/modules/planning/planning.goal.model');
const PlanningItem = require('../src/modules/planning/planning.model');
const MasteryItem = require('../src/modules/mastery/mastery.model');
const WrongItem = require('../src/modules/wrong-item/wrong-item.model');
const NotificationItem = require('../src/modules/notification/notification.model');
const AiAssistItem = require('../src/modules/ai-assist/ai-assist.model');
const { ROLES } = require('../src/shared/roles');

function dayShift(days, hour = 19) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

function ensureSampleFile(subdir, filename, content) {
  const dir = path.join(process.cwd(), 'uploads', subdir);
  fs.mkdirSync(dir, { recursive: true });
  const fullPath = path.join(dir, filename);
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, content, 'utf8');
  }
  return fs.statSync(fullPath).size;
}

async function main() {
  await connectDB();

  const admin = await User.findOne({ role: ROLES.ADMIN });
  const students = await User.find({ role: ROLES.STUDENT });
  const rootSubjects = await Concept.find({ parentConcept: null, status: 'active' }).sort({ order: 1 }).lean();

  if (students.length === 0 || rootSubjects.length === 0) {
    throw new Error('Thiếu tài khoản sinh viên hoặc môn học gốc.');
  }

  // 1. Ensure each subject graph has a few `related` edges (for dashed edges alongside prerequisites)
  const subjectData = [];
  for (const subj of rootSubjects) {
    const graphNodes = await knowledgeService.getSubjectGraph(subj._id);
    if (graphNodes.length >= 4) {
      const hasAnyRelated = graphNodes.some((n) => n.related && n.related.length > 0);
      if (!hasAnyRelated) {
        const n0 = await Concept.findById(graphNodes[0]._id);
        const n2 = await Concept.findById(graphNodes[2]._id);
        if (n0 && n2) {
          n0.related = [n2._id];
          await n0.save();
        }
        if (graphNodes.length >= 6) {
          const n3 = await Concept.findById(graphNodes[3]._id);
          const n5 = await Concept.findById(graphNodes[5]._id);
          if (n3 && n5) {
            n3.related = [n5._id];
            await n3.save();
          }
        }
      }
    }

    const descendantIds = await knowledgeService.getDescendantIds(subj._id);
    const leafIds = await knowledgeService.getDescendantLeafIds(subj._id);
    const questions = await QuestionItem.find({
      concept: { $in: descendantIds },
      status: 'active',
      type: { $in: ['mcq', 'true_false'] },
    })
      .limit(5)
      .lean();
    subjectData.push({ subj, leafIds, questions });
  }

  const activeDecks = await FlashcardDeckItem.find({ status: 'active' }).select('_id').lean();
  const activeCards = await FlashcardItem.find({ deck: { $in: activeDecks.map((d) => d._id) }, status: 'active' })
    .select('_id deck')
    .lean();

  const todayStr = new Date().toISOString().slice(0, 10);

  // 2. Seed full linked data for EVERY student account
  for (const student of students) {
    // 2a. Streak & badges
    if ((student.streak?.current ?? 0) < 5) {
      student.streak = {
        current: 5,
        longest: Math.max(student.streak?.longest ?? 0, 10),
        lastActiveDate: todayStr,
      };
      if (!student.badges?.some((b) => b.code === 'STREAK_3')) {
        student.badges.push({ code: 'STREAK_3', name: 'Khởi động bền bỉ', thresholdDays: 3, earnedAt: dayShift(-2) });
      }
      await student.save();
    }

    // 2b. Enroll in all 6 catalog subjects
    for (const { subj } of subjectData) {
      const exists = await StudentSubjectItem.findOne({ owner: student._id, concept: subj._id });
      if (!exists) {
        await StudentSubjectItem.create({ owner: student._id, createdBy: student._id, concept: subj._id });
      }
    }

    // 2c. Due CardStates for all active flashcards
    const existingStates = await CardState.find({ owner: student._id }).select('card').lean();
    const existingCardSet = new Set(existingStates.map((s) => String(s.card)));
    const missingCards = activeCards.filter((c) => !existingCardSet.has(String(c._id)));
    if (missingCards.length > 0) {
      await CardState.insertMany(
        missingCards.map((c) => ({
          owner: student._id,
          card: c._id,
          deck: c.deck,
          status: 'new',
          dueAt: new Date(Date.now() - 60 * 60 * 1000),
          createdBy: student._id,
        })),
        { ordered: false },
      ).catch(() => {});
    }

    // 2d. MasteryItems & WrongItems across all 6 subjects
    const masteryPresets = [
      { score: 92, level: 'mastered', learningState: 'APPLIED', daysAgo: -1 },
      { score: 78, level: 'proficient', learningState: 'UNDERSTOOD', daysAgo: -2 },
      { score: 54, level: 'developing', learningState: 'PRACTICING', daysAgo: -4 },
      { score: 42, level: 'novice', learningState: 'DECAY_RISK', daysAgo: -16 },
    ];

    for (let sIdx = 0; sIdx < subjectData.length; sIdx++) {
      const { leafIds, questions } = subjectData[sIdx];
      for (let i = 0; i < Math.min(4, leafIds.length); i++) {
        const cid = leafIds[i];
        const exists = await MasteryItem.findOne({ owner: student._id, concept: cid });
        if (!exists) {
          const preset = masteryPresets[i % masteryPresets.length];
          await MasteryItem.create({
            owner: student._id,
            createdBy: student._id,
            concept: cid,
            score: preset.score,
            level: preset.level,
            learningState: preset.learningState,
            attemptsCount: 3,
            correctCount: 2,
            lastAttemptAt: dayShift(preset.daysAgo),
            goalScore: 80,
            history: [
              { score: Math.max(25, preset.score - 20), level: 'developing', reason: 'initial_grading', evidenceType: 'practice', at: dayShift(preset.daysAgo - 3) },
              { score: preset.score, level: preset.level, reason: 'initial_grading', evidenceType: 'chapter_test', at: dayShift(preset.daysAgo) },
            ],
          });
        }
      }

      if (sIdx < 4 && questions.length > 0) {
        for (const q of questions.slice(0, 2)) {
          const exists = await WrongItem.findOne({ owner: student._id, question: q._id });
          if (!exists) {
            await WrongItem.create({
              owner: student._id,
              createdBy: student._id,
              question: q._id,
              concept: q.concept,
              wrongCount: 1,
              lastWrongAt: dayShift(-sIdx - 1),
              status: 'open',
            });
          }
        }
      }
    }

    // 2e. Ensure at least 2 active Goals & Plans (Triết học & Giải tích 1)
    const primarySubjects = subjectData.slice(0, 2);
    for (const { subj, leafIds } of primarySubjects) {
      let goal = await PlanningGoal.findOne({ owner: student._id, concept: subj._id });
      if (!goal) {
        goal = await PlanningGoal.create({
          owner: student._id,
          createdBy: student._id,
          concept: subj._id,
          title: `Chinh phục 8.5 điểm ${subj.name}`,
          examName: `Thi cuối kỳ ${subj.name}`,
          deadline: dayShift(20),
          startDate: dayShift(-3),
          studyDays: 23,
          minutesPerDay: 90,
          targetScore: 8.5,
          importance: 5,
          status: 'active',
          wizardStep: 4,
        });
      }
      const existingPlan = await PlanningItem.findOne({ owner: student._id, goal: goal._id });
      if (!existingPlan) {
        const c1 = leafIds[0] || subj._id;
        const c2 = leafIds[1] || c1;
        const c3 = leafIds[2] || c1;
        await PlanningItem.create({
          owner: student._id,
          createdBy: student._id,
          goal: goal._id,
          title: `Lộ trình ôn tập ${subj.name}`,
          status: 'active',
          sessions: [
            {
              concept: c1,
              title: `Chặng 1: Nền tảng ${subj.name}`,
              chapterTitle: 'Chương 1: Kiến thức nền tảng',
              startAt: dayShift(-1, 19),
              durationMin: 60,
              status: 'done',
              objectives: ['Nắm vững các khái niệm cốt lõi'],
            },
            {
              concept: c2,
              title: `Chặng 2: Trọng tâm ${subj.name}`,
              chapterTitle: 'Chương 2: Nội dung trọng tâm',
              startAt: dayShift(0, 19),
              durationMin: 75,
              status: 'planned',
              objectives: ['Luyện tập vận dụng và làm bài kiểm tra nhanh'],
            },
            {
              concept: c3,
              title: `Chặng 3: Tổng ôn ${subj.name}`,
              chapterTitle: 'Chương 3: Tổng ôn & thi thử',
              startAt: dayShift(2, 19),
              durationMin: 90,
              status: 'planned',
              objectives: ['Giải đề tổng hợp'],
            },
          ],
        });
      }
    }

    // 2f. StudentDocument, Notification, AiAssist
    if ((await StudentDocumentItem.countDocuments({ owner: student._id, status: 'active' })) === 0) {
      const firstSubj = subjectData[0].subj;
      const fname = 'de-cuong-on-tap-chung.pdf';
      const sizeBytes = ensureSampleFile('student-documents', fname, '%PDF-1.4\n% De cuong on tap\n');
      await StudentDocumentItem.create({
        owner: student._id,
        createdBy: student._id,
        title: `Đề cương cá nhân - ${firstSubj.name}`,
        documentRole: 'SYLLABUS',
        description: 'Tài liệu tóm tắt trọng tâm ôn thi.',
        tags: ['đề cương'],
        concept: firstSubj._id,
        fileUrl: `/uploads/student-documents/${fname}`,
        originalName: fname,
        mimeType: 'application/pdf',
        sizeBytes,
        status: 'active',
      });
    }

    if ((await NotificationItem.countDocuments({ owner: student._id })) === 0) {
      await NotificationItem.create([
        {
          owner: student._id,
          createdBy: admin?._id ?? student._id,
          title: 'Chào mừng bạn đến với NaviLearn!',
          content: 'Hệ thống đã sẵn sàng lộ trình học tập và 24 thẻ ghi nhớ đến hạn hôm nay.',
          category: 'hoc_tap',
          link: '/student/today',
          isRead: false,
        },
        {
          owner: student._id,
          createdBy: admin?._id ?? student._id,
          title: 'Khám phá Bản đồ tri thức mới',
          content: 'Xem trực quan mối liên hệ tiên quyết và mức độ thành thạo từng môn học.',
          category: 'he_thong',
          link: '/student/knowledge-map',
          isRead: false,
        },
      ]);
    }

    if ((await AiAssistItem.countDocuments({ owner: student._id })) === 0) {
      await AiAssistItem.create({
        owner: student._id,
        createdBy: student._id,
        concept: subjectData[0].subj._id,
        kind: 'qa',
        prompt: `Tóm tắt trọng tâm chương 1 môn ${subjectData[0].subj.name}?`,
        response: 'Tập trung vào các khái niệm nền tảng, mối liên hệ nhân quả và phương pháp luận cốt lõi.',
      });
    }

    console.log(`Seeded full data for student: ${student.email}`);
  }

  console.log('\n=== SEED ALL STUDENTS COMPLETED ===');
  await disconnectDB();
}

main().catch((err) => {
  console.error('Seed all students failed:', err);
  process.exit(1);
});
