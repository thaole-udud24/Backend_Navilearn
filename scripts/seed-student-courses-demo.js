// Demo data for "Khoá học của tôi" (student@navilearn.local) — real rows through the real schema
// (StudentSubjectItem, PlanningGoal, PlanningItem), not UI-only mock data. Covers the three card
// states the page renders: has an active lộ trình with real progress, has a goal but no lộ trình
// yet, and has neither. Idempotent — safe to run more than once.
//
// Requires scripts/seed-test-accounts.js and scripts/seed-triet-hoc.js to have been run already.
// Usage: node scripts/seed-student-courses-demo.js
require('dotenv').config();
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/modules/account/account.auth.model');
const Concept = require('../src/modules/knowledge/knowledge.model');
const StudentSubjectItem = require('../src/modules/student-subject/student-subject.model');
const PlanningGoal = require('../src/modules/planning/planning.goal.model');
const PlanningItem = require('../src/modules/planning/planning.model');
const PlanTemplateItem = require('../src/modules/plan-template/plan-template.model');
const planTemplateService = require('../src/modules/plan-template/plan-template.service');

const STUDENT_EMAIL = 'student@navilearn.local';
const SUBJECT_NAMES = ['Triết học Mác – Lênin (ôn tập)', 'Đại số', 'Tiếng Anh: Ngữ pháp'];

async function main() {
  await connectDB();

  const student = await User.findOne({ email: STUDENT_EMAIL });
  if (!student) {
    throw new Error(`Chưa có tài khoản ${STUDENT_EMAIL} — chạy "node scripts/seed-test-accounts.js" trước.`);
  }

  const concepts = await Concept.find({ name: { $in: SUBJECT_NAMES }, parentConcept: null });
  const byName = Object.fromEntries(concepts.map((c) => [c.name, c]));
  const missing = SUBJECT_NAMES.filter((n) => !byName[n]);
  if (missing.length) {
    throw new Error(
      `Không tìm thấy môn học gốc: ${missing.join(', ')} — chạy "node scripts/seed-triet-hoc.js" trước (cho Triết học) hoặc kiểm tra scripts/seed-reference-data.js (cho Đại số/Tiếng Anh).`,
    );
  }

  for (const concept of concepts) {
    const existing = await StudentSubjectItem.findOne({ owner: student._id, concept: concept._id });
    if (existing) {
      console.log(`= Môn "${concept.name}" đã có trong "Khoá học của tôi", bỏ qua`);
      continue;
    }
    await StudentSubjectItem.create({
      owner: student._id,
      createdBy: student._id,
      concept: concept._id,
      pinned: false,
      displayOrder: 0,
    });
    console.log(`+ Đã thêm môn "${concept.name}"`);
  }

  // "Đại số": có mục tiêu, chưa có lộ trình — card hiện nút "Tạo lộ trình".
  const algebra = byName['Đại số'];
  const existingGoal = await PlanningGoal.findOne({ owner: student._id, concept: algebra._id });
  if (!existingGoal) {
    const deadline = new Date();
    deadline.setDate(deadline.getDate() + 21);
    await PlanningGoal.create({
      owner: student._id,
      createdBy: student._id,
      concept: algebra._id,
      title: 'Ôn tập Đại số trước kiểm tra giữa kỳ',
      deadline,
      importance: 4,
    });
    console.log('+ Đã tạo mục tiêu cho "Đại số"');
  } else {
    console.log('= Mục tiêu "Đại số" đã có sẵn, bỏ qua');
  }

  // "Triết học Mác – Lênin": áp dụng lộ trình mẫu thật đã xuất bản, xác nhận và đánh dấu buổi đầu
  // tiên đã hoàn thành — để GoalCard hiện tiến độ thật thay vì 0%.
  const triet = byName['Triết học Mác – Lênin (ôn tập)'];
  const hasActivePlan = await PlanningItem.findOne({
    owner: student._id,
    status: 'active',
    'sessions.concept': triet._id,
  });
  if (hasActivePlan) {
    console.log('= Đã có lộ trình đang hoạt động cho "Triết học Mác – Lênin", bỏ qua');
  } else {
    const template = await PlanTemplateItem.findOne({ title: /Triết học Mác/, status: 'published' });
    if (!template) {
      throw new Error(
        'Chưa có lộ trình mẫu Triết học đã xuất bản — chạy "node scripts/seed-triet-hoc.js" trước.',
      );
    }
    // The template itself carries no fixed concept, so apply() needs a goal to read the concept
    // from (see plan-template.service.apply) — reuse one if it already exists from a previous run.
    let goal = await PlanningGoal.findOne({ owner: student._id, concept: triet._id });
    if (!goal) {
      const goalDeadline = new Date();
      goalDeadline.setDate(goalDeadline.getDate() + 14);
      goal = await PlanningGoal.create({
        owner: student._id,
        createdBy: student._id,
        concept: triet._id,
        title: 'Ôn tập Triết học Mác – Lênin trước kỳ thi',
        deadline: goalDeadline,
        importance: 5,
      });
      console.log('+ Đã tạo mục tiêu cho "Triết học Mác – Lênin"');
    }
    const proposed = await planTemplateService.apply(student._id, template._id, goal._id);
    const plan = await PlanningItem.findById(proposed._id);
    plan.status = 'active';
    // Direct mutation (bypassing the "quiz must be passed" gate in planning.service.updateSession):
    // a seed script sets up a starting state, it doesn't play through the real quiz flow.
    if (plan.sessions[0]) {
      plan.sessions[0].status = 'done';
      plan.sessions[0].quizPassed = true;
    }
    await plan.save();
    console.log(`+ Đã áp dụng lộ trình "${template.title}" (đã hoàn thành buổi học đầu tiên)`);
  }

  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
