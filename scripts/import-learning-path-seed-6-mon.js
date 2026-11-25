// Imports doc/NaviLearn_Learning_Path_Seed_6_Mon.md (sections "Learning Path Templates" + "Stages"
// only — real JSON parser, per the doc's own rule). Each of the 6 subject templates becomes one
// real PlanTemplateItem, DRAFT → published via the real plan-template.service.publish() flow (so it
// goes through the same business logic a human Admin review would, not a bypass).
//
// Deliberately NOT imported from this doc, per its own explicit rules:
//   - "Stage Items" (CONCEPT/CUSTOM_TASK rows) — these are self-study activities, not a question
//     bank. The doc states outright: "không tạo ID bài học/bộ đề/thẻ giả" — there is no real
//     Ngân hàng câu hỏi content in this seed at all, so none is invented here. Each step's
//     `questions` stays `[]` and its minute estimate uses the doc's own stated formula
//     (25 study + 15 self-check per concept) instead of re-deriving it from Stage Items.
//   - "Stage Edges" / "Student Goals" / "Student Paths" fixtures — cross-chapter DAG edges aren't
//     representable by this schema's strictly-linear `steps` array (same limitation as every other
//     template already in this DB), and the fixtures are explicitly test-only, never for real
//     accounts ("Goal và instance DEMO chỉ dùng fixture kiểm thử, không nhập vào tài khoản thật").
//
// Usage: node scripts/import-learning-path-seed-6-mon.js [path-to-md]
const fs = require('fs');
const path = require('path');
const { connectDB, disconnectDB } = require('../src/config/db');
const Concept = require('../src/modules/knowledge/knowledge.model');
const PlanTemplateItem = require('../src/modules/plan-template/plan-template.model');
const User = require('../src/modules/account/account.auth.model');
const planTemplateService = require('../src/modules/plan-template/plan-template.service');
const { ROLES } = require('../src/shared/roles');

const MD_PATH = process.argv[2] || path.resolve(__dirname, '../../doc/NaviLearn_Learning_Path_Seed_6_Mon.md');

// Doc's internal subject codes -> the real Concept names imported by
// scripts/import-knowledge-seed-6-mon.js (see NaviLearn_Knowledge_Seed_6_Mon.md section headings).
const SUBJECT_NAME_BY_CODE = {
  PHI101: 'Triết học Mác – Lênin',
  PEC101: 'Kinh tế chính trị Mác – Lênin',
  SOC101: 'Chủ nghĩa xã hội khoa học',
  MAT101: 'Giải tích 1',
  MAT102: 'Giải tích 2',
  MAT103: 'Đại số tuyến tính',
};

const MIN_PER_CONCEPT = 40; // doc's stated formula: 25 min study + 15 min self-apply, per concept

function parseJsonSection(md, heading) {
  const re = new RegExp(`^## ${heading}\\n+\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``, 'm');
  const m = re.exec(md);
  if (!m) throw new Error(`Section "${heading}" not found in ${MD_PATH}`);
  return JSON.parse(m[1]);
}

async function main() {
  const md = fs.readFileSync(MD_PATH, 'utf8');
  const templates = parseJsonSection(md, 'Learning Path Templates');
  const stages = parseJsonSection(md, 'Stages');
  const stageById = new Map(stages.map((s) => [s.id, s]));

  await connectDB();
  const admin = await User.findOne({ role: ROLES.ADMIN });
  if (!admin) throw new Error('No admin user found — create one before running this script.');

  for (const tpl of templates) {
    const subjectName = SUBJECT_NAME_BY_CODE[tpl.subject_id];
    if (!subjectName) throw new Error(`Unknown subject code "${tpl.subject_id}" — update SUBJECT_NAME_BY_CODE.`);
    const subject = await Concept.findOne({ name: subjectName, parentConcept: null });
    if (!subject) {
      console.log(`= Không tìm thấy môn "${subjectName}" — chạy scripts/import-knowledge-seed-6-mon.js trước.`);
      continue;
    }

    const steps = tpl.stage_ids.map((stageId, i) => {
      const stage = stageById.get(stageId);
      if (!stage) throw new Error(`Stage "${stageId}" referenced by ${tpl.id} not found in Stages section`);
      return {
        dayOffset: i + 1,
        durationMin: Math.min(480, stage.concept_ids.length * MIN_PER_CONCEPT),
        title: stage.title,
        note: '',
        objectives: stage.objectives,
        theoryContent: '',
        questions: [],
      };
    });

    const existing = await PlanTemplateItem.findOne({ title: tpl.title, concept: subject._id });
    if (existing) {
      console.log(`= Lộ trình "${tpl.title}" đã có, bỏ qua.`);
      continue;
    }

    const created = await planTemplateService.create(admin._id, {
      title: tpl.title,
      description: tpl.description,
      concept: subject._id,
      steps,
      source: 'import',
    });
    await planTemplateService.publish(created._id, admin._id, 'Nhập từ NaviLearn_Learning_Path_Seed_6_Mon.md v1.0');
    console.log(`+ Đã tạo và xuất bản lộ trình "${tpl.title}" (${steps.length} chặng) cho môn "${subjectName}"`);
  }

  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
