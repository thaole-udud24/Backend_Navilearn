// Admin data-cleanup script (ad-hoc request, not a recurring job): the Knowledge Map requires real
// `order` + `prerequisites` on Concept to lay out and connect a readable graph. "Triết học Mác –
// Lênin" already has 19 real chapter concepts (from scripts/seed-triet-hoc.js) but every one was
// left at `order: 0` and `prerequisites: []`, so the map rendered them as a single disconnected
// column (see bug report). "Đại số" and "Hình học" had zero child concepts at all.
//
// This script:
//   1) fixes order + prerequisites (linear chapter chain) for the existing Triết học concepts,
//   2) creates a standard, real Vietnamese high-school curriculum chapter list for Đại số và Hình
//      học (as scripts/seed-triet-hoc.js and scripts/seed-reference-data.js already do for other
//      subjects — this is seed/reference content, not fabricated student data), chained the same way.
//
// Idempotent: existing concepts are updated by name match, never duplicated.
// Usage: node scripts/normalize-knowledge-structure.js
require('dotenv').config();
const { connectDB, disconnectDB } = require('../src/config/db');
const Concept = require('../src/modules/knowledge/knowledge.model');
const User = require('../src/modules/account/account.auth.model');
const { ROLES } = require('../src/shared/roles');

const TRIET_HOC_ORDER = [
  'C1.1 — Triết học và đối tượng của triết học',
  'C1.2 — Vấn đề cơ bản của triết học',
  'C1.3 — Duy vật – duy tâm; khả tri – bất khả tri',
  'C1.4 — Biện chứng – siêu hình; sự ra đời triết học Mác – Lênin',
  'C2.1 — Vật chất',
  'C2.2 — Vận động, không gian, thời gian',
  'C2.3 — Ý thức và quan hệ vật chất – ý thức',
  'C3.1 — Hai nguyên lý của phép biện chứng',
  'C3.2 — Quy luật lượng – chất',
  'C3.3 — Quy luật mâu thuẫn',
  'C3.4 — Quy luật phủ định của phủ định',
  'C4.1 — Cái riêng – cái chung; nguyên nhân – kết quả; tất nhiên – ngẫu nhiên',
  'C4.2 — Nội dung – hình thức; bản chất – hiện tượng; khả năng – hiện thực',
  'C5.1 — Thực tiễn',
  'C5.2 — Quá trình nhận thức và chân lý',
  'C6.1 — Lực lượng sản xuất – quan hệ sản xuất',
  'C6.2 — Cơ sở hạ tầng – kiến trúc thượng tầng; hình thái kinh tế – xã hội',
  'C6.3 — Giai cấp, dân tộc, nhà nước',
  'C6.4 — Ý thức xã hội và con người',
];

const SUBJECTS = {
  'Đại số': [
    ['Mệnh đề và tập hợp', 'Khái niệm mệnh đề, phép toán logic, tập hợp và các phép toán trên tập hợp.'],
    ['Hàm số bậc nhất và bậc hai', 'Tập xác định, đồ thị, sự biến thiên của hàm số bậc nhất và bậc hai.'],
    ['Phương trình và hệ phương trình', 'Phương trình bậc nhất, bậc hai, hệ phương trình bậc nhất nhiều ẩn.'],
    ['Bất phương trình và hệ bất phương trình', 'Dấu nhị thức bậc nhất, tam thức bậc hai, hệ bất phương trình.'],
    ['Dãy số, cấp số cộng và cấp số nhân', 'Khái niệm dãy số, công thức tổng quát và tổng n số hạng đầu.'],
  ],
  'Hình học': [
    ['Vectơ trong mặt phẳng', 'Khái niệm vectơ, các phép toán vectơ và ứng dụng.'],
    ['Hệ thức lượng trong tam giác', 'Định lý côsin, định lý sin và ứng dụng giải tam giác.'],
    ['Đường thẳng và góc trong mặt phẳng', 'Phương trình đường thẳng, vị trí tương đối, góc giữa hai đường thẳng.'],
    ['Đường tròn', 'Phương trình đường tròn, vị trí tương đối giữa đường thẳng và đường tròn.'],
    ['Ba đường conic', 'Elip, hypebol, parabol: phương trình chính tắc và tính chất cơ bản.'],
  ],
};

async function chainPrerequisites(concepts) {
  for (let i = 0; i < concepts.length; i++) {
    concepts[i].order = i;
    concepts[i].prerequisites = i === 0 ? [] : [concepts[i - 1]._id];
    await concepts[i].save();
  }
}

async function main() {
  await connectDB();

  const admin = await User.findOne({ role: ROLES.ADMIN });
  if (!admin) throw new Error('No admin user found — create one before running this script.');

  // 1) Triết học Mác – Lênin: fix order + chain the 19 existing concepts in curriculum order.
  const trietSubject = await Concept.findOne({
    name: 'Triết học Mác – Lênin (ôn tập)',
    parentConcept: null,
  });
  if (!trietSubject) {
    console.log('= Không tìm thấy môn "Triết học Mác – Lênin (ôn tập)", bỏ qua.');
  } else {
    const children = await Concept.find({ parentConcept: trietSubject._id, status: 'active' });
    const byName = new Map(children.map((c) => [c.name, c]));
    const ordered = TRIET_HOC_ORDER.map((name) => byName.get(name)).filter(Boolean);
    if (ordered.length !== TRIET_HOC_ORDER.length) {
      console.log(
        `⚠ Chỉ khớp được ${ordered.length}/${TRIET_HOC_ORDER.length} chương của Triết học — kiểm tra lại tên.`,
      );
    }
    await chainPrerequisites(ordered);
    console.log(`+ Đã chuẩn hoá order + prerequisites cho ${ordered.length} chương Triết học Mác – Lênin`);
  }

  // 2) Đại số / Hình học: create the real chapter list (idempotent by name) and chain them.
  for (const [subjectName, chapters] of Object.entries(SUBJECTS)) {
    const subject = await Concept.findOne({ name: subjectName, parentConcept: null });
    if (!subject) {
      console.log(`= Không tìm thấy môn "${subjectName}", bỏ qua.`);
      continue;
    }
    const existing = await Concept.find({ parentConcept: subject._id, status: 'active' });
    const existingByName = new Map(existing.map((c) => [c.name, c]));

    const ordered = [];
    for (const [name, description] of chapters) {
      let concept = existingByName.get(name);
      if (!concept) {
        concept = await Concept.create({
          owner: admin._id,
          createdBy: admin._id,
          name,
          description,
          parentConcept: subject._id,
          status: 'active',
          source: 'manual',
        });
        console.log(`+ Đã tạo chương "${name}" cho môn "${subjectName}"`);
      }
      ordered.push(concept);
    }
    await chainPrerequisites(ordered);
    console.log(`+ Đã chuẩn hoá order + prerequisites cho ${ordered.length} chương môn "${subjectName}"`);
  }

  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
