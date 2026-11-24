// Gives each real "test" student account (@navilearn.local — distinct from actual gmail signups,
// which this script never touches) a real goal + an active plan applied from one of the 6
// published templates from scripts/import-learning-path-seed-6-mon.js, so "Lộ kế hoạch học tập"
// isn't empty for manual testing. First stage/session is marked done (with its quiz passed) so
// progress shows as non-zero, same convention as scripts/seed-student-courses-demo.js.
//
// Idempotent: skips a student who already has an active plan for the chosen subject.
// Usage: node scripts/seed-test-students-learning-path.js
require('dotenv').config();
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/modules/account/account.auth.model');
const Concept = require('../src/modules/knowledge/knowledge.model');
const StudentSubjectItem = require('../src/modules/student-subject/student-subject.model');
const PlanningGoal = require('../src/modules/planning/planning.goal.model');
const PlanningItem = require('../src/modules/planning/planning.model');
const PlanTemplateItem = require('../src/modules/plan-template/plan-template.model');
const planTemplateService = require('../src/modules/plan-template/plan-template.service');
const { ROLES } = require('../src/shared/roles');

// Only the designated test/demo fixtures, never a real gmail signup account.
const TEST_STUDENT_EMAILS = ['student@navilearn.local', 'test@navilearn.local', 'minhanh.demo@navilearn.local'];

// One subject per test student, spread across the 6 for variety (matches Courses.tsx demo seed's
// own reasoning for not making every demo card look the same).
const ASSIGNMENTS = {
  'student@navilearn.local': { subject: 'Triết học Mác – Lênin', template: 'Nắm vững Triết học Mác – Lênin' },
  'test@navilearn.local': { subject: 'Giải tích 1', template: 'Nắm vững Giải tích 1' },
  'minhanh.demo@navilearn.local': { subject: 'Đại số tuyến tính', template: 'Nắm vững Đại số tuyến tính' },
};

async function main() {
  await connectDB();

  for (const email of TEST_STUDENT_EMAILS) {
    const student = await User.findOne({ email, role: ROLES.STUDENT });
    if (!student) {
      console.log(`= Không tìm thấy tài khoản ${email}, bỏ qua.`);
      continue;
    }
    const { subject: subjectName, template: templateTitle } = ASSIGNMENTS[email];
    const subject = await Concept.findOne({ name: subjectName, parentConcept: null });
    if (!subject) {
      console.log(`= Không tìm thấy môn "${subjectName}" cho ${email}, bỏ qua.`);
      continue;
    }

    const existingActive = await PlanningItem.findOne({ owner: student._id, status: 'active' });
    if (existingActive) {
      console.log(`= ${email} đã có lộ trình đang hoạt động, bỏ qua.`);
      continue;
    }

    const existingSubject = await StudentSubjectItem.findOne({ owner: student._id, concept: subject._id });
    if (!existingSubject) {
      await StudentSubjectItem.create({
        owner: student._id,
        createdBy: student._id,
        concept: subject._id,
        pinned: false,
        displayOrder: 0,
      });
      console.log(`+ Đã thêm môn "${subjectName}" vào "Khoá học của tôi" của ${email}`);
    }

    let goal = await PlanningGoal.findOne({ owner: student._id, concept: subject._id });
    if (!goal) {
      const deadline = new Date();
      deadline.setDate(deadline.getDate() + 30);
      goal = await PlanningGoal.create({
        owner: student._id,
        createdBy: student._id,
        concept: subject._id,
        title: `Ôn tập ${subjectName}`,
        deadline,
        importance: 4,
      });
      console.log(`+ Đã tạo mục tiêu "${goal.title}" cho ${email}`);
    }

    const template = await PlanTemplateItem.findOne({ title: templateTitle, status: 'published' });
    if (!template) {
      console.log(`= Không tìm thấy lộ trình mẫu "${templateTitle}" đã xuất bản, bỏ qua ${email}.`);
      continue;
    }

    const proposed = await planTemplateService.apply(student._id, template._id, goal._id);
    const plan = await PlanningItem.findById(proposed._id);
    plan.status = 'active';
    if (plan.sessions[0]) {
      plan.sessions[0].status = 'done';
      plan.sessions[0].quizPassed = true;
    }
    await plan.save();
    console.log(`+ Đã áp dụng lộ trình "${template.title}" (đang hoạt động) cho ${email}`);
  }

  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
