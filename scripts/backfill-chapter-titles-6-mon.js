// One-off backfill: the 6 templates from scripts/import-learning-path-seed-6-mon.js were created
// before PlanTemplateStep/session gained `chapterTitle` — this fills it in on the existing records
// (templates + any PlanningItem already applied from them) without recreating anything, using the
// same two source docs (real data, not invented).
//
// Usage: node scripts/backfill-chapter-titles-6-mon.js
const fs = require('fs');
const path = require('path');
const { connectDB, disconnectDB } = require('../src/config/db');
const PlanTemplateItem = require('../src/modules/plan-template/plan-template.model');
const PlanningItem = require('../src/modules/planning/planning.model');

const KNOWLEDGE_MD_PATH = path.resolve(__dirname, '../../doc/NaviLearn_Knowledge_Seed_6_Mon.md');
const LP_MD_PATH = path.resolve(__dirname, '../../doc/NaviLearn_Learning_Path_Seed_6_Mon.md');

function parseJsonSection(md, heading, mdPath) {
  const re = new RegExp(`^## ${heading}\\n+\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``, 'm');
  const m = re.exec(md);
  if (!m) throw new Error(`Section "${heading}" not found in ${mdPath}`);
  return JSON.parse(m[1]);
}

function parseAllSubjectBlocks(md) {
  const blocks = [];
  const re = /^## (\S+) — .+\n+```json\n([\s\S]*?)\n```/gm;
  let m;
  while ((m = re.exec(md))) blocks.push({ code: m[1], nodes: JSON.parse(m[2]) });
  return blocks;
}

async function main() {
  const knowledgeMd = fs.readFileSync(KNOWLEDGE_MD_PATH, 'utf8');
  const lpMd = fs.readFileSync(LP_MD_PATH, 'utf8');

  const blocks = parseAllSubjectBlocks(knowledgeMd);
  const chapterTitleByCode = new Map();
  for (const block of blocks) {
    for (const node of block.nodes) {
      if (node.type === 'chapter') chapterTitleByCode.set(node.id, node.title);
    }
  }

  const stages = parseJsonSection(lpMd, 'Stages', LP_MD_PATH);
  // Stage title -> chapter title (stage titles are unique across the seed, same assumption the
  // import/wiring scripts already rely on).
  const chapterTitleByStageTitle = new Map();
  for (const stage of stages) {
    const chapterTitle = chapterTitleByCode.get(stage.chapter_id);
    if (chapterTitle) chapterTitleByStageTitle.set(stage.title, chapterTitle);
  }

  await connectDB();

  const templates = await PlanTemplateItem.find({ source: 'import' });
  let templateCount = 0;
  for (const template of templates) {
    let changed = false;
    const steps = template.steps.map((step) => {
      const chapterTitle = chapterTitleByStageTitle.get(step.title);
      if (chapterTitle && step.chapterTitle !== chapterTitle) changed = true;
      return { ...step.toObject(), chapterTitle: chapterTitle ?? step.chapterTitle };
    });
    if (changed) {
      await PlanTemplateItem.updateOne({ _id: template._id }, { steps });
      templateCount++;
      console.log(`+ Đã gắn tên chương cho lộ trình "${template.title}"`);
    }
  }

  const plans = await PlanningItem.find({});
  let planCount = 0;
  for (const plan of plans) {
    let changed = false;
    plan.sessions.forEach((session) => {
      const chapterTitle = chapterTitleByStageTitle.get(session.title);
      if (chapterTitle && session.chapterTitle !== chapterTitle) {
        session.chapterTitle = chapterTitle;
        changed = true;
      }
    });
    if (changed) {
      await plan.save();
      planCount++;
    }
  }

  console.log(`+ Đã cập nhật ${templateCount} lộ trình mẫu và ${planCount} kế hoạch đã áp dụng.`);
  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
