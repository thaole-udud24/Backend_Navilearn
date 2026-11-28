// Clean & Complete Idempotent Seed Script for NaviLearn
// Ensures every subject and student-facing module has clean, linked, realistic data.
// Usage: node scripts/seed-clean-complete.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/modules/account/account.auth.model');
const Concept = require('../src/modules/knowledge/knowledge.model');
const knowledgeService = require('../src/modules/knowledge/knowledge.service');
const StudentSubjectItem = require('../src/modules/student-subject/student-subject.model');
const StudentDocumentItem = require('../src/modules/student-document/student-document.model');
const AssetItem = require('../src/modules/asset/asset.model');
const QuestionItem = require('../src/modules/question-bank/question-bank.model');
const AssessmentConfigItem = require('../src/modules/assessment-config/assessment-config.model');
const { FlashcardDeckItem, FlashcardItem } = require('../src/modules/flashcard/flashcard.model');
const CardState = require('../src/modules/flashcard/card-state.model');
const PlanningGoal = require('../src/modules/planning/planning.goal.model');
const PlanningItem = require('../src/modules/planning/planning.model');
const MasteryItem = require('../src/modules/mastery/mastery.model');
const WrongItem = require('../src/modules/wrong-item/wrong-item.model');
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

function ensureSampleFile(subdir, filename, content) {
  const dir = path.join(process.cwd(), 'uploads', subdir);
  fs.mkdirSync(dir, { recursive: true });
  const fullPath = path.join(dir, filename);
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, content, 'utf8');
  }
  return fs.statSync(fullPath).size;
}

const FLASHCARD_TEMPLATES = {
  'Triết học': [
    { front: 'Vấn đề cơ bản của triết học gồm mấy mặt?', back: '2 mặt: Mặt thứ nhất (bản thể luận - vật chất hay ý thức có trước) và Mặt thứ hai (nhận thức luận - con người có nhận thức được thế giới không).' },
    { front: 'Định nghĩa vật chất của V.I. Lênin nhấn mạnh thuộc tính nào?', back: 'Thuộc tính khách quan: tồn tại độc lập với ý thức và được ý thức phản ánh.' },
    { front: 'Hai nguyên lý cơ bản của phép biện chứng duy vật là gì?', back: 'Nguyên lý về mối liên hệ phổ biến và Nguyên lý về sự phát triển.' },
    { front: 'Ba quy luật cơ bản của phép biện chứng duy vật?', back: 'Lượng - Chất, Mâu thuẫn (thống nhất và đấu tranh giữa các mặt đối lập), Phủ định của phủ định.' },
  ],
  'Giải tích 1': [
    { front: 'Giới hạn cơ bản lim(x->0) sin(x)/x bằng bao nhiêu?', back: 'Bằng 1.' },
    { front: 'Định lý Lagrange (giá trị trung bình) phát biểu gì?', back: 'Nếu f liên tục trên [a,b] và khả vi trên (a,b) thì tồn tại c in (a,b) sao cho f\'(c) = (f(b)-f(a))/(b-a).' },
    { front: 'Điều kiện cần để hàm f khả vi tại x0 có cực trị tại x0?', back: 'f\'(x0) = 0 (điểm dừng).' },
    { front: 'Công thức tích phân từng phần?', back: '∫u dv = uv - ∫v du.' },
  ],
  'Giải tích 2': [
    { front: 'Điều kiện cần để hàm nhiều biến f(x,y) đạt cực trị tại M0?', back: 'Các đạo hàm riêng cấp 1 tại M0 bằng 0: ∂f/∂x = 0 và ∂f/∂y = 0.' },
    { front: 'Định lý Fubini dùng để làm gì?', back: 'Chuyển tích phân bội trên hình chữ nhật/miền đơn giản thành tích phân lặp.' },
    { front: 'Ý nghĩa hình học của vector gradient ∇f(M0)?', back: 'Chỉ hướng hàm số f tăng nhanh nhất tại M0 và vuông góc với đường mức qua M0.' },
    { front: 'Công thức Green liên hệ giữa tích phân nào?', back: 'Liên hệ giữa tích phân đường loại 2 trên biên kín C và tích phân kép trên miền D.' },
  ],
  'Đại số tuyến tính': [
    { front: 'Điều kiện để ma trận vuông A khả nghịch?', back: 'det(A) ≠ 0 (tương đương hạng r(A) = n).' },
    { front: 'Định lý Kronecker–Capelli về hệ phương trình tuyến tính Ax = b?', back: 'Hệ có nghiệm khi và chỉ khi rank(A) = rank(A|b).' },
    { front: 'Giá trị riêng λ của ma trận A thỏa mãn phương trình nào?', back: 'det(A - λI) = 0 (phương trình đặc trưng).' },
    { front: 'Số chiều của không gian nghiệm hệ thuần nhất Ax = 0?', back: 'dim(Ker A) = n - rank(A) (với n là số ẩn).' },
  ],
  'Kinh tế chính trị': [
    { front: 'Hai thuộc tính của hàng hóa là gì?', back: 'Giá trị sử dụng và Giá trị.' },
    { front: 'Nguồn gốc của giá trị thặng dư theo C. Mác?', back: 'Do lao động sống của công nhân làm thuê tạo ra vượt quá giá trị sức lao động.' },
    { front: 'Công thức chung của tư bản là gì?', back: 'T - H - T\' với T\' = T + Δt (Δt > 0 là giá trị thặng dư).' },
    { front: 'Cấu tạo hữu cơ của tư bản ký hiệu là gì?', back: 'c/v (tỷ lệ giữa tư bản bất biến c và tư bản khả biến v).' },
  ],
  'Chủ nghĩa xã hội': [
    { front: 'Sứ mệnh lịch sử của giai cấp công nhân là gì?', back: 'Xóa bỏ chế độ tư bản chủ nghĩa, xây dựng chủ nghĩa xã hội và chủ nghĩa cộng sản.' },
    { front: 'Hai giai đoạn phát triển của hình thái kinh tế - xã hội cộng sản chủ nghĩa?', back: 'Giai đoạn thấp (Chủ nghĩa xã hội) và Giai đoạn cao (Chủ nghĩa cộng sản).' },
    { front: 'Đặc trưng bản chất của dân chủ xã hội chủ nghĩa?', back: 'Quyền lực thuộc về nhân dân, do Đảng Cộng sản lãnh đạo, gắn liền với pháp chế XHCN.' },
    { front: 'Liên minh công - nông - trí thức dựa trên cơ sở nào?', back: 'Cơ sở kinh tế (lợi ích thống nhất) và cơ sở chính trị - xã hội.' },
  ],
};

function pickFlashcardsForSubject(subjectName) {
  for (const [key, cards] of Object.entries(FLASHCARD_TEMPLATES)) {
    if (subjectName.includes(key)) return cards;
  }
  return FLASHCARD_TEMPLATES['Triết học'];
}

async function main() {
  await connectDB();

  const admin = await User.findOne({ email: ADMIN_EMAIL, role: ROLES.ADMIN });
  const student = await User.findOne({ email: STUDENT_EMAIL, role: ROLES.STUDENT });
  if (!admin || !student) {
    throw new Error('Không tìm thấy tài khoản admin@navilearn.local hoặc student@navilearn.local');
  }

  // 1. Clean up orphan flashcards / card states that reference missing decks
  const existingDecks = await FlashcardDeckItem.find().select('_id').lean();
  const deckIdSet = new Set(existingDecks.map((d) => String(d._id)));
  const orphanCards = await FlashcardItem.find().select('_id deck').lean();
  const orphanCardIds = orphanCards.filter((c) => !deckIdSet.has(String(c.deck))).map((c) => c._id);
  if (orphanCardIds.length > 0) {
    await CardState.deleteMany({ card: { $in: orphanCardIds } });
    await FlashcardItem.deleteMany({ _id: { $in: orphanCardIds } });
    console.log(`Cleaned ${orphanCardIds.length} orphan flashcards & card states.`);
  }

  // 2. Load active root subjects
  const rootSubjects = await Concept.find({ parentConcept: null, status: 'active' }).sort({ order: 1 }).lean();
  if (rootSubjects.length === 0) {
    throw new Error('Không tìm thấy môn học gốc nào trong DB.');
  }

  // Enroll student in first 5 subjects (keep 6th un-enrolled so Admin/Student can test dynamic enrollment)
  const enrollTargets = rootSubjects.slice(0, Math.min(5, rootSubjects.length));
  for (const subj of enrollTargets) {
    const exists = await StudentSubjectItem.findOne({ owner: student._id, concept: subj._id });
    if (!exists) {
      await StudentSubjectItem.create({ owner: student._id, createdBy: student._id, concept: subj._id });
    }
  }

  // 3. Seed per-subject Assets, Flashcard Decks/Cards/States, AssessmentConfigs, Mastery, WrongItems
  let createdAssets = 0;
  let createdDecks = 0;
  let createdConfigs = 0;
  let createdWrong = 0;
  let createdMastery = 0;

  for (let sIdx = 0; sIdx < rootSubjects.length; sIdx++) {
    const subj = rootSubjects[sIdx];
    const descendantIds = await knowledgeService.getDescendantIds(subj._id);
    const leafIds = await knowledgeService.getDescendantLeafIds(subj._id);
    const targetConceptId = leafIds[0] || subj._id;

    // 3a. Assets (2 per subject)
    const assetSpecs = [
      {
        title: `Đề cương ôn tập ${subj.name}`,
        documentRole: 'SYLLABUS',
        description: `Tổng hợp trọng tâm kiến thức và cấu trúc đề thi môn ${subj.name}.`,
        tags: ['đề cương', 'trọng tâm'],
        important: true,
        filename: `de-cuong-${String(subj._id).slice(-6)}.pdf`,
        mimeType: 'application/pdf',
      },
      {
        title: `Slide bài giảng tổng hợp - ${subj.name}`,
        documentRole: 'SLIDES',
        description: `Tài liệu bài giảng chi tiết theo từng chương của môn ${subj.name}.`,
        tags: ['slide', 'bài giảng'],
        important: false,
        filename: `slide-${String(subj._id).slice(-6)}.pdf`,
        mimeType: 'application/pdf',
      },
    ];
    for (const spec of assetSpecs) {
      const exists = await AssetItem.findOne({ title: spec.title, status: 'active' });
      if (!exists) {
        const sizeBytes = ensureSampleFile('assets', spec.filename, `%PDF-1.4\n% ${spec.title}\n`);
        await AssetItem.create({
          title: spec.title,
          concept: subj._id,
          assetType: 'document',
          documentRole: spec.documentRole,
          fileUrl: `/uploads/assets/${spec.filename}`,
          originalName: spec.filename,
          mimeType: spec.mimeType,
          sizeBytes,
          description: spec.description,
          tags: spec.tags,
          important: spec.important,
          studentVisible: true,
          status: 'active',
          createdBy: admin._id,
        });
        createdAssets++;
      }
    }

    // 3b. Flashcard Deck + Cards + Due CardStates
    const deckTitle = `Bộ thẻ ghi nhớ trọng tâm: ${subj.name}`;
    let deck = await FlashcardDeckItem.findOne({ title: deckTitle, status: 'active' });
    if (!deck) {
      deck = await FlashcardDeckItem.create({
        title: deckTitle,
        concept: targetConceptId,
        description: `Ôn tập nhanh các khái niệm và công thức cốt lõi môn ${subj.name}.`,
        status: 'active',
        createdBy: admin._id,
      });
      createdDecks++;
    }

    const cardTemplates = pickFlashcardsForSubject(subj.name);
    for (const tpl of cardTemplates) {
      let card = await FlashcardItem.findOne({ deck: deck._id, front: tpl.front, status: 'active' });
      if (!card) {
        card = await FlashcardItem.create({
          deck: deck._id,
          front: tpl.front,
          back: tpl.back,
          status: 'active',
          createdBy: admin._id,
        });
      }
      const state = await CardState.findOne({ owner: student._id, card: card._id });
      if (!state) {
        await CardState.create({
          owner: student._id,
          card: card._id,
          deck: deck._id,
          status: 'new',
          dueAt: new Date(Date.now() - 60 * 60 * 1000),
          createdBy: student._id,
        });
      }
    }

    // 3c. Questions under subject -> AssessmentConfig (practice + mock_exam)
    const subjQuestions = await QuestionItem.find({
      concept: { $in: descendantIds },
      status: 'active',
      type: { $in: ['mcq', 'true_false'] },
    })
      .limit(10)
      .lean();

    if (subjQuestions.length >= 2) {
      // Group questions by their exact concept for AssessmentConfig validation
      const firstConceptId = subjQuestions[0].concept;
      const sameConceptQs = subjQuestions.filter((q) => String(q.concept) === String(firstConceptId)).slice(0, 5);
      if (sameConceptQs.length >= 2) {
        const practiceTitle = `Luyện tập nhanh: ${subj.name}`;
        if (!(await AssessmentConfigItem.findOne({ title: practiceTitle, status: 'active' }))) {
          await AssessmentConfigItem.create({
            owner: admin._id,
            createdBy: admin._id,
            title: practiceTitle,
            concept: firstConceptId,
            questions: sameConceptQs.map((q) => q._id),
            passScore: 60,
            timeLimitMinutes: 15,
            kind: 'practice',
            status: 'active',
          });
          createdConfigs++;
        }

        const mockTitle = `Đề thi thử giữa kỳ: ${subj.name}`;
        if (!(await AssessmentConfigItem.findOne({ title: mockTitle, status: 'active' }))) {
          await AssessmentConfigItem.create({
            owner: admin._id,
            createdBy: admin._id,
            title: mockTitle,
            concept: firstConceptId,
            questions: sameConceptQs.map((q) => q._id),
            passScore: 70,
            timeLimitMinutes: 30,
            kind: 'mock_exam',
            status: 'active',
          });
          createdConfigs++;
        }
      }

      // 3d. Seed WrongItems across first 4 enrolled subjects
      if (sIdx < 4) {
        for (const q of subjQuestions.slice(0, 2)) {
          const exists = await WrongItem.findOne({ owner: student._id, question: q._id });
          if (!exists) {
            await WrongItem.create({
              owner: student._id,
              createdBy: student._id,
              question: q._id,
              concept: q.concept,
              wrongCount: sIdx + 1,
              lastWrongAt: dayShift(-sIdx - 1),
              status: 'open',
            });
            createdWrong++;
          }
        }
      }
    }

    // 3e. Seed MasteryItems for first 4 enrolled subjects (3 leaf concepts each)
    if (sIdx < 4 && leafIds.length > 0) {
      const levels = [
        { score: 88, level: 'mastered', learningState: 'APPLIED', daysAgo: -1 },
        { score: 74, level: 'proficient', learningState: 'UNDERSTOOD', daysAgo: -2 },
        { score: 52, level: 'developing', learningState: 'PRACTICING', daysAgo: -5 },
      ];
      for (let i = 0; i < Math.min(3, leafIds.length); i++) {
        const cid = leafIds[i];
        const exists = await MasteryItem.findOne({ owner: student._id, concept: cid });
        if (!exists) {
          const preset = levels[i % levels.length];
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
          createdMastery++;
        }
      }
    }
  }

  // 4. Ensure Student has active Goals & Plans across at least 2 distinct subjects (Triết học & Giải tích 1)
  const giaiTich1 = rootSubjects.find((s) => s.name.includes('Giải tích 1'));
  if (giaiTich1) {
    let gtGoal = await PlanningGoal.findOne({ owner: student._id, concept: giaiTich1._id });
    if (!gtGoal) {
      gtGoal = await PlanningGoal.create({
        owner: student._id,
        createdBy: student._id,
        concept: giaiTich1._id,
        title: 'Đạt 8.5+ Giải tích 1 cuối kỳ',
        examName: 'Thi cuối kỳ Giải tích 1',
        deadline: dayShift(21),
        startDate: dayShift(-3),
        studyDays: 24,
        minutesPerDay: 90,
        targetScore: 85,
        importance: 5,
        status: 'active',
        wizardStep: 4,
      });
    }
    const existingGtPlan = await PlanningItem.findOne({ owner: student._id, goal: gtGoal._id });
    if (!existingGtPlan) {
      const gtLeaves = await knowledgeService.getDescendantLeafIds(giaiTich1._id);
      const c1 = gtLeaves[0] || giaiTich1._id;
      const c2 = gtLeaves[1] || c1;
      const c3 = gtLeaves[2] || c1;
      await PlanningItem.create({
        owner: student._id,
        createdBy: student._id,
        goal: gtGoal._id,
        title: 'Lộ trình ôn tập Giải tích 1',
        status: 'active',
        sessions: [
          {
            concept: c1,
            title: 'Giới hạn hàm số và dãy số',
            chapterTitle: 'Chương 1: Giới hạn & Liên tục',
            startAt: dayShift(-1, 19),
            durationMin: 60,
            status: 'done',
            objectives: ['Nắm vững các giới hạn cơ bản', 'Áp dụng quy tắc L’Hôpital'],
          },
          {
            concept: c2,
            title: 'Đạo hàm và vi phân hàm một biến',
            chapterTitle: 'Chương 2: Phép tính vi phân',
            startAt: dayShift(0, 19),
            durationMin: 60,
            status: 'planned',
            objectives: ['Tính đạo hàm hàm hợp', 'Khảo sát cực trị hàm số'],
          },
          {
            concept: c3,
            title: 'Tích phân bất định & xác định',
            chapterTitle: 'Chương 3: Phép tính tích phân',
            startAt: dayShift(2, 19),
            durationMin: 90,
            status: 'planned',
            objectives: ['Đổi biến số và tích phân từng phần'],
          },
        ],
      });
    }

    // Add a StudentDocument for Giải tích 1
    const gtDocTitle = 'Tổng hợp công thức Đạo hàm & Tích phân';
    if (!(await StudentDocumentItem.findOne({ owner: student._id, title: gtDocTitle, status: 'active' }))) {
      const filename = 'cong-thuc-giai-tich-1.pdf';
      const sizeBytes = ensureSampleFile('student-documents', filename, '%PDF-1.4\n% Cong thuc Giai tich 1\n');
      await StudentDocumentItem.create({
        owner: student._id,
        createdBy: student._id,
        title: gtDocTitle,
        documentRole: 'SUPPLEMENT',
        description: 'Bảng tổng hợp các công thức đạo hàm, nguyên hàm và tích phân thường gặp.',
        tags: ['công thức', 'giải tích 1'],
        concept: giaiTich1._id,
        fileUrl: `/uploads/student-documents/${filename}`,
        originalName: filename,
        mimeType: 'application/pdf',
        sizeBytes,
        status: 'active',
      });
    }

    // Add an AiAssistItem for Giải tích 1
    const gtPrompt = 'Khi nào áp dụng được quy tắc L’Hôpital để tính giới hạn?';
    if (!(await AiAssistItem.findOne({ owner: student._id, prompt: gtPrompt }))) {
      await AiAssistItem.create({
        owner: student._id,
        createdBy: student._id,
        concept: giaiTich1._id,
        kind: 'qa',
        prompt: gtPrompt,
        response: 'Khi giới hạn có dạng vô định 0/0 hoặc ∞/∞ và hai hàm tử, mẫu khả vi trong lân cận điểm xét.',
      });
    }
  }

  const summary = {
    enrolledSubjects: await StudentSubjectItem.countDocuments({ owner: student._id }),
    assets: await AssetItem.countDocuments({ status: 'active' }),
    flashcardDecks: await FlashcardDeckItem.countDocuments({ status: 'active' }),
    flashcards: await FlashcardItem.countDocuments({ status: 'active' }),
    dueCardStates: await CardState.countDocuments({ owner: student._id, dueAt: { $lte: new Date() } }),
    assessmentConfigs: await AssessmentConfigItem.countDocuments({ status: 'active' }),
    wrongItems: await WrongItem.countDocuments({ owner: student._id }),
    masteryItems: await MasteryItem.countDocuments({ owner: student._id }),
    planningGoals: await PlanningGoal.countDocuments({ owner: student._id }),
    planningItems: await PlanningItem.countDocuments({ owner: student._id }),
    studentDocuments: await StudentDocumentItem.countDocuments({ owner: student._id, status: 'active' }),
    aiAssistItems: await AiAssistItem.countDocuments({ owner: student._id }),
    newlyCreated: { createdAssets, createdDecks, createdConfigs, createdWrong, createdMastery },
  };

  console.log('\n=== CLEAN & COMPLETE SEED SUMMARY ===');
  console.log(JSON.stringify(summary, null, 2));
  await disconnectDB();
}

main().catch((err) => {
  console.error('Clean seed failed:', err);
  process.exit(1);
});
