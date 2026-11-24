// Imports doc/NaviLearn_Knowledge_Seed_6_Mon.md — parses each subject's fenced ```json``` block with
// a real JSON parser (per the doc's own "Quy ước nhập liệu": never let AI guess edges from names or
// order). Each node becomes a Concept; `type` has no separate schema field — subject/chapter/topic/
// concept are simply depth 0/1/2/3 of the existing parentConcept tree, same as every other subject
// already in this DB. Two passes per the doc: (1) upsert nodes + parent links, (2) wire
// `prerequisites` by id, after every node exists so cross-branch references resolve.
//
// Scope is exactly these 6 subjects: for each one, if a top-level Concept with the same title
// already exists, its whole subtree (chapters/topics/concepts) is deleted first ("clear dữ liệu
// cũ") so the re-import starts clean — nothing outside these 6 subjects is touched.
//
// Usage: node scripts/import-knowledge-seed-6-mon.js [path-to-md]
const fs = require('fs');
const path = require('path');
const { connectDB, disconnectDB } = require('../src/config/db');
const Concept = require('../src/modules/knowledge/knowledge.model');
const User = require('../src/modules/account/account.auth.model');
const { ROLES } = require('../src/shared/roles');

const MD_PATH = process.argv[2] || path.resolve(__dirname, '../../doc/NaviLearn_Knowledge_Seed_6_Mon.md');

function parseSections(md) {
  const sections = [];
  const re = /^## (.+?)\n+```json\n([\s\S]*?)\n```/gm;
  let m;
  while ((m = re.exec(md))) {
    sections.push({ heading: m[1].trim(), nodes: JSON.parse(m[2]) });
  }
  return sections;
}

async function clearSubjectByTitle(title) {
  const existing = await Concept.findOne({ name: title, parentConcept: null });
  if (!existing) return;
  // Breadth-first collect the whole subtree, then delete deepest-first (children before parents) —
  // softDeletePlugin marks records deleted rather than removing rows, order doesn't matter for FK
  // integrity here, but it keeps the intent explicit.
  const toDelete = [existing._id];
  let frontier = [existing._id];
  while (frontier.length) {
    const children = await Concept.find({ parentConcept: { $in: frontier } }, '_id');
    frontier = children.map((c) => c._id);
    toDelete.push(...frontier);
  }
  await Concept.deleteMany({ _id: { $in: toDelete } });
  console.log(`= Đã xoá ${toDelete.length} node cũ của môn "${title}"`);
}

async function importSection(section, ownerId) {
  const idToMongoId = new Map();

  // Pass 1: create nodes in parent-before-child order (nodes are already listed that way in the
  // doc, but sort defensively by id length as a cheap depth proxy in case that ever changes).
  const ordered = [...section.nodes].sort((a, b) => a.id.split('.').length - b.id.split('.').length);
  for (const node of ordered) {
    const parentConcept = node.parent_id ? (idToMongoId.get(node.parent_id) ?? null) : null;
    const created = await Concept.create({
      owner: ownerId,
      createdBy: ownerId,
      name: node.title,
      description: node.learning_objective || '',
      order: node.order ?? 0,
      status: 'active',
      source: 'import',
      parentConcept,
    });
    idToMongoId.set(node.id, created._id);
  }

  // Pass 2: wire prerequisites now that every id in this subject resolves to a real _id. A
  // prerequisite id the doc itself never declared (typo, cross-subject miss) is skipped and logged
  // rather than silently dropped or turned into a fake edge.
  let edgeCount = 0;
  for (const node of section.nodes) {
    if (!node.prerequisites?.length) continue;
    const prereqMongoIds = [];
    for (const pid of node.prerequisites) {
      const mongoId = idToMongoId.get(pid);
      if (mongoId) prereqMongoIds.push(mongoId);
      else console.log(`  ⚠ "${node.id}" tham chiếu tiên quyết không tồn tại trong môn này: ${pid}`);
    }
    if (prereqMongoIds.length) {
      await Concept.updateOne({ _id: idToMongoId.get(node.id) }, { prerequisites: prereqMongoIds });
      edgeCount += prereqMongoIds.length;
    }
  }

  console.log(`+ Đã nhập môn "${section.heading}": ${section.nodes.length} node, ${edgeCount} cạnh tiên quyết`);
}

async function main() {
  const md = fs.readFileSync(MD_PATH, 'utf8');
  const sections = parseSections(md);
  if (sections.length === 0) throw new Error(`Không tìm thấy khối JSON nào trong ${MD_PATH}`);

  await connectDB();
  const admin = await User.findOne({ role: ROLES.ADMIN });
  if (!admin) throw new Error('No admin user found — create one before running this script.');

  for (const section of sections) {
    const subjectNode = section.nodes.find((n) => n.parent_id === null);
    if (subjectNode) await clearSubjectByTitle(subjectNode.title);
    await importSection(section, admin._id);
  }

  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
