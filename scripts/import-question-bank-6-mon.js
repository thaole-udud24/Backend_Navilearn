// Imports doc/NaviLearn_Question_Bank_6_Mon.md — real JSON parser, per its own rule ("Import
// Knowledge rồi Learning Path trước"). Two real pieces of data:
//   1) "Questions" (157 items) -> real QuestionItem docs, one per Concept.
//   2) "Stage Quizzes" (52 items) -> wired into the matching PlanTemplateItem step's `questions`
//      array (gates that step behind a real quiz instead of nothing), by stage title — the same
//      title scripts/import-learning-path-seed-6-mon.js already used for each step.
//
// Concept codes (e.g. "PHI101.C01.K01") only exist in the markdown docs, never persisted in the DB
// (Concept only stores `name`) — so this script rebuilds the code->name map from
// NaviLearn_Knowledge_Seed_6_Mon.md's own JSON (the same source of truth the Concept docs were
// created from) and resolves each one to the real Concept _id, scoped to its own subject's subtree
// so same-named concepts across subjects can never cross-match.
//
// A template whose steps reference several different leaf concepts can't carry one single
// `concept` (the create/update validation requires every step question to belong to that one
// concept) — so, matching this codebase's existing convention for multi-concept templates, each
// template's `concept` is set back to null here once its real per-stage quizzes are wired in.
//
// Usage: node scripts/import-question-bank-6-mon.js [path-to-question-bank-md] [path-to-knowledge-md] [path-to-learning-path-md]
const fs = require('fs');
const path = require('path');
const { connectDB, disconnectDB } = require('../src/config/db');
const Concept = require('../src/modules/knowledge/knowledge.model');
const QuestionItem = require('../src/modules/question-bank/question-bank.model');
const PlanTemplateItem = require('../src/modules/plan-template/plan-template.model');
const User = require('../src/modules/account/account.auth.model');
const planTemplateService = require('../src/modules/plan-template/plan-template.service');
const { ROLES } = require('../src/shared/roles');

const QB_MD_PATH = process.argv[2] || path.resolve(__dirname, '../../doc/NaviLearn_Question_Bank_6_Mon.md');
const KNOWLEDGE_MD_PATH =
  process.argv[3] || path.resolve(__dirname, '../../doc/NaviLearn_Knowledge_Seed_6_Mon.md');
const LP_MD_PATH =
  process.argv[4] || path.resolve(__dirname, '../../doc/NaviLearn_Learning_Path_Seed_6_Mon.md');

const SUBJECT_NAME_BY_CODE = {
  PHI101: 'Triết học Mác – Lênin',
  PEC101: 'Kinh tế chính trị Mác – Lênin',
  SOC101: 'Chủ nghĩa xã hội khoa học',
  MAT101: 'Giải tích 1',
  MAT102: 'Giải tích 2',
  MAT103: 'Đại số tuyến tính',
};

const DIFFICULTY_MAP = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' };

function parseJsonSection(md, heading, mdPath) {
  const re = new RegExp(`^## ${heading}\\n+\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``, 'm');
  const m = re.exec(md);
  if (!m) throw new Error(`Section "${heading}" not found in ${mdPath}`);
  return JSON.parse(m[1]);
}

// Every subject's own ```json block in the Knowledge doc, keyed by its "## CODE — Title" heading.
function parseAllSubjectConceptBlocks(md) {
  const blocks = [];
  const re = /^## (\S+) — .+\n+```json\n([\s\S]*?)\n```/gm;
  let m;
  while ((m = re.exec(md))) blocks.push({ code: m[1], nodes: JSON.parse(m[2]) });
  return blocks;
}

async function collectSubtreeIds(rootId) {
  const all = [rootId];
  let frontier = [rootId];
  while (frontier.length) {
    const children = await Concept.find({ parentConcept: { $in: frontier }, status: 'active' }, '_id');
    frontier = children.map((c) => c._id);
    all.push(...frontier);
  }
  return all;
}

async function main() {
  const qbMd = fs.readFileSync(QB_MD_PATH, 'utf8');
  const knowledgeMd = fs.readFileSync(KNOWLEDGE_MD_PATH, 'utf8');
  const lpMd = fs.readFileSync(LP_MD_PATH, 'utf8');

  const questions = parseJsonSection(qbMd, 'Questions', QB_MD_PATH);
  const stageQuizzes = parseJsonSection(qbMd, 'Stage Quizzes', QB_MD_PATH);
  const conceptBlocks = parseAllSubjectConceptBlocks(knowledgeMd);
  const stages = parseJsonSection(lpMd, 'Stages', LP_MD_PATH);
  const stageById = new Map(stages.map((s) => [s.id, s]));

  await connectDB();
  const admin = await User.findOne({ role: ROLES.ADMIN });
  if (!admin) throw new Error('No admin user found — create one before running this script.');

  // code (e.g. "PHI101.C01.K01") -> real Concept _id, scoped per subject so same-named leaves in
  // different subjects can never cross-resolve.
  const conceptIdByCode = new Map();
  for (const block of conceptBlocks) {
    const subjectName = SUBJECT_NAME_BY_CODE[block.code];
    if (!subjectName) continue;
    const subject = await Concept.findOne({ name: subjectName, parentConcept: null });
    if (!subject) {
      console.log(`= Không tìm thấy môn "${subjectName}", bỏ qua câu hỏi của môn này.`);
      continue;
    }
    const subtreeIds = await collectSubtreeIds(subject._id);
    const subtreeConcepts = await Concept.find({ _id: { $in: subtreeIds } }, 'name');
    const byName = new Map(subtreeConcepts.map((c) => [c.name, c._id]));
    for (const node of block.nodes) {
      if (node.type !== 'concept') continue;
      const id = byName.get(node.title);
      if (id) conceptIdByCode.set(node.id, id);
    }
  }

  // 1) Questions
  const mongoIdByQuestionCode = new Map();
  let createdCount = 0;
  for (const q of questions) {
    const conceptId = conceptIdByCode.get(q.concept_id);
    if (!conceptId) {
      console.log(`  ⚠ Bỏ qua câu "${q.id}" — không tìm được kiến thức "${q.concept_id}"`);
      continue;
    }
    const existing = await QuestionItem.findOne({ concept: conceptId, text: q.stem });
    if (existing) {
      mongoIdByQuestionCode.set(q.id, existing._id);
      continue;
    }
    const correctIds = new Set(q.correct_option_ids ?? []);
    const created = await QuestionItem.create({
      owner: admin._id,
      createdBy: admin._id,
      concept: conceptId,
      type: q.type === 'SINGLE_CHOICE' ? 'mcq' : 'essay',
      text: q.stem,
      options: (q.options ?? []).map((o) => ({ text: o.text, isCorrect: correctIds.has(o.id) })),
      referenceAnswer: q.explanation ?? '',
      difficulty: DIFFICULTY_MAP[q.difficulty] ?? 'medium',
      points: q.points ?? 1,
      status: 'active',
      source: 'import',
    });
    mongoIdByQuestionCode.set(q.id, created._id);
    createdCount++;
  }
  console.log(`+ Đã tạo ${createdCount} câu hỏi mới (${questions.length - createdCount} đã có sẵn, bỏ qua)`);

  // 2) Wire each Stage Quiz into the matching PlanTemplateItem step (match by stage title — the
  // same title scripts/import-learning-path-seed-6-mon.js gave that step).
  const templates = await PlanTemplateItem.find({ source: 'import' });
  let wiredCount = 0;
  for (const template of templates) {
    let changed = false;
    const steps = template.steps.map((step) => ({ ...step.toObject() }));
    for (const quiz of stageQuizzes) {
      const stage = stageById.get(quiz.stage_id);
      if (!stage) continue;
      const stepIndex = steps.findIndex((s) => s.title === stage.title);
      if (stepIndex === -1) continue; // this stage belongs to a different subject's template
      const questionMongoIds = (quiz.question_ids ?? [])
        .map((qid) => mongoIdByQuestionCode.get(qid))
        .filter(Boolean);
      if (questionMongoIds.length === 0) continue;
      if (steps[stepIndex].questions?.length) continue; // already wired on a previous run
      steps[stepIndex].questions = questionMongoIds;
      changed = true;
      wiredCount++;
    }
    if (changed) {
      // concept:null — a template whose steps each gate on their own stage-specific concept's
      // quiz can't carry one single template-level concept (see file header comment).
      await planTemplateService.update(template._id, admin._id, { concept: null, steps });
      console.log(`+ Đã gắn quiz cuối chặng cho lộ trình "${template.title}"`);
    }
  }
  console.log(`+ Tổng cộng đã gắn ${wiredCount} quiz cuối chặng`);

  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
