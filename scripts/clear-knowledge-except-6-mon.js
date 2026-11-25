// Ad-hoc cleanup (explicit admin request): keep only the 6 subjects just imported by
// scripts/import-knowledge-seed-6-mon.js, soft-delete every other Concept plus every record in
// other collections that references one of those removed concepts — so nothing in the admin UI or
// student app is left pointing at a dangling/deleted concept id.
//
// Soft delete only (sets `deletedAt`, same as every other "xoá" in this app) — reversible by
// clearing `deletedAt` in the DB if this turns out to be a mistake. Nothing outside concept
// ownership is touched (no accounts, no unrelated settings).
//
// Usage: node scripts/clear-knowledge-except-6-mon.js
require('dotenv').config();
const { connectDB, disconnectDB } = require('../src/config/db');
const Concept = require('../src/modules/knowledge/knowledge.model');
const AdaptiveActivity = require('../src/modules/adaptive/adaptive.model');
const AiAssistItem = require('../src/modules/ai-assist/ai-assist.model');
const AssessmentConfigItem = require('../src/modules/assessment-config/assessment-config.model');
const Rubric = require('../src/modules/assessment-config/rubric.model');
const AssessmentItem = require('../src/modules/assessment/assessment.model');
const AssetItem = require('../src/modules/asset/asset.model');
const { FlashcardDeckItem, FlashcardItem } = require('../src/modules/flashcard/flashcard.model');
const LessonItem = require('../src/modules/lesson/lesson.model');
const MasteryItem = require('../src/modules/mastery/mastery.model');
const PlanTemplateItem = require('../src/modules/plan-template/plan-template.model');
const PlanningGoal = require('../src/modules/planning/planning.goal.model');
const PlanningItem = require('../src/modules/planning/planning.model');
const QuestionItem = require('../src/modules/question-bank/question-bank.model');
const StudentSubjectItem = require('../src/modules/student-subject/student-subject.model');

const KEEP_TITLES = [
  'Triết học Mác – Lênin',
  'Kinh tế chính trị Mác – Lênin',
  'Chủ nghĩa xã hội khoa học',
  'Giải tích 1',
  'Giải tích 2',
  'Đại số tuyến tính',
];

async function collectSubtreeIds(rootIds) {
  const all = new Set(rootIds.map(String));
  let frontier = rootIds;
  while (frontier.length) {
    const children = await Concept.find({ parentConcept: { $in: frontier } }, '_id');
    frontier = children.map((c) => c._id);
    frontier.forEach((id) => all.add(String(id)));
  }
  return all;
}

async function softDeleteByConcept(Model, label, deleteIds) {
  const res = await Model.updateMany(
    { concept: { $in: deleteIds }, deletedAt: null },
    { deletedAt: new Date() },
  );
  if (res.modifiedCount) console.log(`  - ${label}: đã ẩn ${res.modifiedCount} bản ghi`);
}

async function main() {
  await connectDB();

  const keepSubjects = await Concept.find({ name: { $in: KEEP_TITLES }, parentConcept: null });
  if (keepSubjects.length !== KEEP_TITLES.length) {
    const found = new Set(keepSubjects.map((s) => s.name));
    const missing = KEEP_TITLES.filter((t) => !found.has(t));
    throw new Error(
      `Không tìm thấy đủ 6 môn cần giữ lại (thiếu: ${missing.join(', ')}) — chạy scripts/import-knowledge-seed-6-mon.js trước.`,
    );
  }

  const keepIds = await collectSubtreeIds(keepSubjects.map((s) => s._id));
  console.log(`Giữ lại ${keepIds.length ?? keepIds.size} node thuộc 6 môn: ${KEEP_TITLES.join(', ')}`);

  const toDelete = await Concept.find({ _id: { $nin: [...keepIds] } }, '_id');
  const deleteIds = toDelete.map((c) => c._id);
  console.log(`Sẽ ẩn (soft-delete) ${deleteIds.length} kiến thức ngoài phạm vi 6 môn trên.`);

  if (deleteIds.length === 0) {
    console.log('Không có gì để xoá — dữ liệu đã chỉ còn 6 môn.');
    await disconnectDB();
    return;
  }

  console.log('Dọn các bản ghi liên quan tới các kiến thức sẽ bị ẩn:');
  await softDeleteByConcept(AdaptiveActivity, 'AdaptiveActivity', deleteIds);
  await softDeleteByConcept(AiAssistItem, 'AiAssistItem', deleteIds);
  await softDeleteByConcept(AssessmentConfigItem, 'AssessmentConfigItem', deleteIds);
  await softDeleteByConcept(Rubric, 'Rubric', deleteIds);
  await softDeleteByConcept(AssessmentItem, 'AssessmentItem', deleteIds);
  await softDeleteByConcept(AssetItem, 'AssetItem', deleteIds);
  await softDeleteByConcept(FlashcardDeckItem, 'FlashcardDeckItem', deleteIds);
  await softDeleteByConcept(FlashcardItem, 'FlashcardItem', deleteIds);
  await softDeleteByConcept(LessonItem, 'LessonItem', deleteIds);
  await softDeleteByConcept(MasteryItem, 'MasteryItem', deleteIds);
  await softDeleteByConcept(PlanTemplateItem, 'PlanTemplateItem', deleteIds);
  await softDeleteByConcept(PlanningGoal, 'PlanningGoal', deleteIds);
  await softDeleteByConcept(StudentSubjectItem, 'StudentSubjectItem', deleteIds);
  await softDeleteByConcept(QuestionItem, 'QuestionItem', deleteIds);

  // PlanningItem keeps its concept per-session, not on the document itself — soft-delete the whole
  // plan if ANY of its sessions points at a removed concept (a plan mixing kept/removed concepts
  // isn't something that should ever happen from real usage, but this errs on the safe side).
  const planRes = await PlanningItem.updateMany(
    { 'sessions.concept': { $in: deleteIds }, deletedAt: null },
    { deletedAt: new Date() },
  );
  if (planRes.modifiedCount) console.log(`  - PlanningItem: đã ẩn ${planRes.modifiedCount} bản ghi`);

  const conceptRes = await Concept.updateMany(
    { _id: { $in: deleteIds }, deletedAt: null },
    { deletedAt: new Date() },
  );
  console.log(`+ Đã ẩn ${conceptRes.modifiedCount} kiến thức. Giữ lại đúng 6 môn yêu cầu.`);

  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
