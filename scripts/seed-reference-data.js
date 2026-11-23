// Seed chuẩn dữ liệu tham chiếu cho NaviLearn: khái niệm theo môn học (Khung chương trình THPT) +
// vài lộ trình mẫu (Plan Template) để admin có dữ liệu thật ngay khi vào các trang quản trị mới.
// Idempotent: chạy lại không tạo trùng (upsert theo tên).
// Usage: node scripts/seed-reference-data.js [adminEmail]
require('dotenv').config();
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/modules/account/account.auth.model');
const Concept = require('../src/modules/knowledge/knowledge.model');
const PlanTemplateItem = require('../src/modules/plan-template/plan-template.model');
const businessRuleService = require('../src/modules/business-rule/business-rule.service');
const { ROLES } = require('../src/shared/roles');

// Khung chương trình THPT: 8 môn chuẩn x 3 chủ đề trọng tâm mỗi môn.
const SUBJECTS = [
  { subject: 'Toán học', topics: ['Đại số', 'Hình học', 'Giải tích'] },
  { subject: 'Vật lý', topics: ['Cơ học', 'Điện học', 'Quang học'] },
  { subject: 'Hóa học', topics: ['Hóa vô cơ', 'Hóa hữu cơ', 'Phản ứng hóa học'] },
  { subject: 'Sinh học', topics: ['Di truyền học', 'Sinh thái học', 'Tế bào học'] },
  { subject: 'Ngữ văn', topics: ['Văn học Việt Nam', 'Văn học nước ngoài', 'Kỹ năng làm văn'] },
  { subject: 'Tiếng Anh', topics: ['Ngữ pháp', 'Từ vựng', 'Kỹ năng đọc hiểu'] },
  { subject: 'Lịch sử', topics: ['Lịch sử Việt Nam', 'Lịch sử thế giới'] },
  { subject: 'Địa lý', topics: ['Địa lý tự nhiên', 'Địa lý kinh tế - xã hội'] },
];

async function seedConcepts(adminId) {
  const byName = new Map();
  let order = 0;
  for (const { subject, topics } of SUBJECTS) {
    for (const topic of topics) {
      const name = `${subject}: ${topic}`;
      // eslint-disable-next-line no-await-in-loop
      const concept = await Concept.findOneAndUpdate(
        { name },
        {
          $setOnInsert: {
            owner: adminId,
            createdBy: adminId,
            description: `Chủ đề trọng tâm thuộc môn ${subject}.`,
            status: 'active',
          },
          $set: { order },
        },
        { upsert: true, new: true },
      );
      byName.set(name, concept);
      order += 1;
    }
  }
  return byName;
}

async function seedPlanTemplates(adminId, concepts) {
  const templates = [
    {
      title: 'Lộ trình cấp tốc 1 tuần — Đại số',
      description: 'Ôn luyện Đại số trong 7 ngày trước kỳ kiểm tra, mỗi ngày một buổi ngắn.',
      concept: concepts.get('Toán học: Đại số')?._id ?? null,
      steps: [
        { dayOffset: 1, durationMin: 30, note: 'Ôn lại lý thuyết trọng tâm' },
        { dayOffset: 2, durationMin: 45, note: 'Làm bài tập cơ bản' },
        { dayOffset: 4, durationMin: 45, note: 'Làm bài tập nâng cao' },
        { dayOffset: 6, durationMin: 60, note: 'Luyện đề thi thử' },
        { dayOffset: 7, durationMin: 30, note: 'Tổng hợp lỗi sai và ôn lại' },
      ],
    },
    {
      title: 'Lộ trình ôn tập 2 tuần — Ngữ pháp Tiếng Anh',
      description: 'Củng cố ngữ pháp Tiếng Anh theo lộ trình 2 tuần, tăng dần độ khó.',
      concept: concepts.get('Tiếng Anh: Ngữ pháp')?._id ?? null,
      steps: [
        { dayOffset: 1, durationMin: 30, note: 'Ôn thì động từ cơ bản' },
        { dayOffset: 3, durationMin: 30, note: 'Luyện câu điều kiện' },
        { dayOffset: 6, durationMin: 45, note: 'Luyện câu bị động' },
        { dayOffset: 9, durationMin: 45, note: 'Luyện mệnh đề quan hệ' },
        { dayOffset: 12, durationMin: 45, note: 'Luyện đề tổng hợp' },
        { dayOffset: 14, durationMin: 30, note: 'Kiểm tra lại toàn bộ' },
      ],
    },
    {
      title: 'Lộ trình tổng quát — Áp dụng theo mục tiêu của bạn',
      description:
        'Không gắn sẵn chủ đề — khi áp dụng, hệ thống dùng đúng khái niệm của mục tiêu học tập bạn chọn.',
      concept: null,
      steps: [
        { dayOffset: 1, durationMin: 30, note: 'Đọc lại lý thuyết trọng tâm' },
        { dayOffset: 3, durationMin: 45, note: 'Luyện tập cơ bản' },
        { dayOffset: 5, durationMin: 45, note: 'Luyện tập nâng cao' },
        { dayOffset: 7, durationMin: 60, note: 'Kiểm tra lại toàn bộ' },
      ],
    },
  ];

  for (const tpl of templates) {
    // eslint-disable-next-line no-await-in-loop
    await PlanTemplateItem.findOneAndUpdate(
      { title: tpl.title },
      { $setOnInsert: { createdBy: adminId, isActive: true }, $set: { ...tpl } },
      { upsert: true, new: true },
    );
  }
}

async function main() {
  const [adminEmail = 'admin@navilearn.local'] = process.argv.slice(2);

  await connectDB();

  const admin = await User.findOne({ email: adminEmail, role: ROLES.ADMIN });
  if (!admin) {
    console.error(
      `Khong tim thay tai khoan admin "${adminEmail}". Hay chay "node scripts/seed-admin.js" truoc.`,
    );
    await disconnectDB();
    process.exit(1);
  }

  const concepts = await seedConcepts(admin.id);
  console.log(`Da seed ${concepts.size} khai niem (Ban do tri thuc) theo ${SUBJECTS.length} mon hoc chuan.`);

  await seedPlanTemplates(admin.id, concepts);
  console.log('Da seed 3 lo trinh mau (Plan Template).');

  await businessRuleService.ensureDefaultRules();
  console.log('Da dam bao bo Quy tac nghiep vu mac dinh ton tai.');

  await disconnectDB();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDB();
  process.exit(1);
});
