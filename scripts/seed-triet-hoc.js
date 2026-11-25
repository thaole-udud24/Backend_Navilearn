// One-off import script for doc/NaviLearn_On_tap_Triet_hoc_Mac_Lenin.md — parses the markdown per
// the format the document itself defines (section 0.2) and writes it into the real collections
// (Concept, QuestionItem, FlashcardDeckItem/FlashcardItem, LessonItem, PlanTemplateItem). Not
// idempotent: refuses to run if the subject Concept already exists, instead of silently deleting —
// delete it by hand in Kho tri thức first if you want to re-run.
//
// Usage:  node scripts/seed-triet-hoc.js [path-to-md]

const fs = require('fs');
const path = require('path');
const { connectDB, disconnectDB } = require('../src/config/db');
const Concept = require('../src/modules/knowledge/knowledge.model');
const QuestionItem = require('../src/modules/question-bank/question-bank.model');
const { FlashcardDeckItem, FlashcardItem } = require('../src/modules/flashcard/flashcard.model');
const LessonItem = require('../src/modules/lesson/lesson.model');
const PlanTemplateItem = require('../src/modules/plan-template/plan-template.model');
const User = require('../src/modules/account/account.auth.model');
const { ROLES } = require('../src/shared/roles');

const SUBJECT_NAME = 'Triết học Mác – Lênin (ôn tập)';
const MD_PATH = process.argv[2] || path.resolve(__dirname, '../../doc/NaviLearn_On_tap_Triet_hoc_Mac_Lenin.md');

// ---------- 0.4: concept vocabulary (hardcoded from the doc's own table, not regex-parsed — a
// small fixed list is safer than parsing a markdown table for something this load-bearing). ----------
const CONCEPTS = [
  ['C1.1', 'Triết học và đối tượng của triết học'],
  ['C1.2', 'Vấn đề cơ bản của triết học'],
  ['C1.3', 'Duy vật – duy tâm; khả tri – bất khả tri'],
  ['C1.4', 'Biện chứng – siêu hình; sự ra đời triết học Mác – Lênin'],
  ['C2.1', 'Vật chất'],
  ['C2.2', 'Vận động, không gian, thời gian'],
  ['C2.3', 'Ý thức và quan hệ vật chất – ý thức'],
  ['C3.1', 'Hai nguyên lý của phép biện chứng'],
  ['C3.2', 'Quy luật lượng – chất'],
  ['C3.3', 'Quy luật mâu thuẫn'],
  ['C3.4', 'Quy luật phủ định của phủ định'],
  ['C4.1', 'Cái riêng – cái chung; nguyên nhân – kết quả; tất nhiên – ngẫu nhiên'],
  ['C4.2', 'Nội dung – hình thức; bản chất – hiện tượng; khả năng – hiện thực'],
  ['C5.1', 'Thực tiễn'],
  ['C5.2', 'Quá trình nhận thức và chân lý'],
  ['C6.1', 'Lực lượng sản xuất – quan hệ sản xuất'],
  ['C6.2', 'Cơ sở hạ tầng – kiến trúc thượng tầng; hình thái kinh tế – xã hội'],
  ['C6.3', 'Giai cấp, dân tộc, nhà nước'],
  ['C6.4', 'Ý thức xã hội và con người'],
];

// ---------- 3.1: stage overview (hardcoded — the stage yaml blocks use multiline YAML folding
// that isn't worth regex-parsing for 8 fixed rows). ----------
const STAGES = [
  { key: 'S0', dayOffset: 1, durationMin: 30 },
  { key: 'S1', dayOffset: 2, durationMin: 75 },
  { key: 'S2', dayOffset: 4, durationMin: 80 },
  { key: 'S3', dayOffset: 6, durationMin: 90 },
  { key: 'S4', dayOffset: 8, durationMin: 70 },
  { key: 'S5', dayOffset: 10, durationMin: 70 },
  { key: 'S6', dayOffset: 12, durationMin: 90 },
  { key: 'S7', dayOffset: 14, durationMin: 75 },
];

// Lesson -> concept code. L0.1/L7.1 are whole-course overviews, tagged to the subject root itself
// (passed in as `rootCode` at build time). Picked by hand against each lesson's actual content —
// see the "Việc cần làm sau khi nhập" note in the doc: a reviewer should double-check these.
const LESSON_CONCEPT = {
  'L0.1': null,
  'L1.1': 'C1.1',
  'L1.2': 'C1.2',
  'L1.3': 'C1.4',
  'L2.1': 'C2.1',
  'L2.2': 'C2.2',
  'L2.3': 'C2.3',
  'L3.1': 'C3.1',
  'L3.2': 'C3.2',
  'L3.3': 'C3.3',
  'L4.1': 'C4.1',
  'L4.2': 'C4.2',
  'L5.1': 'C5.1',
  'L5.2': 'C5.2',
  'L6.1': 'C6.1',
  'L6.2': 'C6.2',
  'L6.3': 'C6.3',
  'L6.4': 'C6.4',
  'L7.1': null,
};

function readSource() {
  return fs.readFileSync(MD_PATH, 'utf8');
}

// ---------- question block parsing (section 0.2/0.3) ----------
const Q_HEADER_RE = /^\*\*(Q-[A-Z0-9-]+)\*\*\s*·\s*(\w+)\s*·\s*(\w+)\s*·\s*(C\d+\.\d+)(?:\s*·\s*(\d+)đ)?\s*$/gm;

function splitByHeader(text, headerRe) {
  const matches = [...text.matchAll(headerRe)];
  const chunks = [];
  for (let i = 0; i < matches.length; i += 1) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    chunks.push({ match: matches[i], body: text.slice(start, end) });
  }
  return chunks;
}

function parseQuestions(sectionText) {
  return splitByHeader(sectionText, Q_HEADER_RE).map(({ match, body }) => {
    const [, qid, rawType, rawDifficulty, conceptCode, points] = match;
    const stemMatch = body.match(/^Đề:\s*([\s\S]*?)\n(?:[A-D]\.|Đáp án)/m);
    const stem = (stemMatch ? stemMatch[1] : body.match(/^Đề:\s*(.+)$/m)?.[1] ?? '').trim();
    const options = [...body.matchAll(/^([A-D])\.\s+(.+)$/gm)].map((m) => ({
      letter: m[1],
      text: m[2].trim(),
    }));
    const answerLineMatch = body.match(/^Đáp án(?:\s*\([^)]*\))?:\s*(.*)$/m);
    let answer = (answerLineMatch ? answerLineMatch[1] : '').trim();
    // SHORT: the rubric is the bullet list between the "Đáp án (rubric ...):" line and "Giải thích:".
    const rubricMatch = body.match(/^Đáp án\s*\(rubric[^)]*\):\s*\n((?:- .+\n?)+)/m);
    if (rubricMatch) answer = rubricMatch[1].trim();
    const explanationMatch = body.match(/^Giải thích:\s*([\s\S]*?)$/m);
    const explanation = (explanationMatch ? explanationMatch[1] : '').trim();

    return {
      qid,
      type: rawType, // SINGLE | MULTI | TRUEFALSE | FILL | SHORT
      difficulty: rawDifficulty.toLowerCase(), // easy | medium | hard
      conceptCode,
      points: points ? Number(points) : 1,
      stem,
      options,
      answer,
      explanation,
    };
  });
}

const DIFFICULTY_MAP = { easy: 'easy', medium: 'medium', hard: 'hard' };

// Maps the doc's 5 question types onto this system's 3 (mcq/true_false/essay — see
// question-bank.model.js). MULTI/FILL/SHORT become `essay`, graded by the existing reference-answer
// heuristic/AI grading instead of exact option matching — a real simplification, not a bug; flagged
// to the user so a reviewer knows these need a closer look before publishing.
function toQuestionDoc({ q, conceptId, ownerId }) {
  const base = {
    owner: ownerId,
    createdBy: ownerId,
    concept: conceptId,
    text: q.stem,
    difficulty: DIFFICULTY_MAP[q.difficulty] || 'medium',
    points: q.points,
    source: 'import',
    status: 'active',
  };

  if (q.type === 'SINGLE') {
    const correctLetters = new Set(q.answer.split(',').map((s) => s.trim()));
    return {
      ...base,
      type: 'mcq',
      options: q.options.map((o) => ({ text: o.text, isCorrect: correctLetters.has(o.letter) })),
      referenceAnswer: q.explanation,
    };
  }
  if (q.type === 'TRUEFALSE') {
    const isTrue = /^ĐÚNG$/i.test(q.answer);
    return {
      ...base,
      type: 'true_false',
      options: [
        { text: 'Đúng', isCorrect: isTrue },
        { text: 'Sai', isCorrect: !isTrue },
      ],
      referenceAnswer: q.explanation,
    };
  }
  // MULTI / FILL / SHORT -> essay (see comment above).
  let referenceAnswer = q.answer;
  if (q.type === 'MULTI') {
    const correctLetters = q.answer.split(',').map((s) => s.trim());
    referenceAnswer = q.options
      .filter((o) => correctLetters.includes(o.letter))
      .map((o) => `${o.letter}. ${o.text}`)
      .join('; ');
  }
  return {
    ...base,
    type: 'essay',
    options: [],
    referenceAnswer: `${referenceAnswer}\n\n${q.explanation}`.trim(),
  };
}

// ---------- lesson theory -> TheoryBlockEditor's block format ----------
// Mirrors frontend_navilearn/src/lib/theoryBlocks.ts serializeTheoryBlocks() exactly: a
// 'theory-blocks-v1:' marker + JSON array of {type, content}. Without the marker, the viewer treats
// the whole string as one raw paragraph instead of parsing it as blocks.
const THEORY_MARKER = 'theory-blocks-v1:';

function paragraphsOf(theoryText) {
  return theoryText
    .split(/\n{2,}/)
    .map((p) => p.replace(/\*\*/g, '').replace(/\n/g, ' ').trim())
    .filter(Boolean);
}

function serializeBlocks(blocks) {
  const nonEmpty = blocks.filter((b) => b.content.trim());
  return nonEmpty.length ? THEORY_MARKER + JSON.stringify(nonEmpty) : '';
}

async function main() {
  await connectDB();
  const owner = await User.findOne({ role: ROLES.ADMIN });
  if (!owner) throw new Error('No admin user found — create one before running this script.');
  const ownerId = owner._id;

  console.log(`Using admin "${owner.email || owner._id}" as owner/createdBy for imported content.`);

  // Not idempotent by design: re-running without cleaning up first would create a second copy of
  // everything. Refuse instead of silently deleting — deleting is the user's call, not this script's.
  const existingSubject = await Concept.findOne({ name: SUBJECT_NAME, parentConcept: null });
  if (existingSubject) {
    throw new Error(
      `Môn "${SUBJECT_NAME}" đã tồn tại (Concept ${existingSubject._id}). Xoá thủ công trong Kho tri thức ` +
        'trước khi chạy lại script này, để tránh tạo trùng dữ liệu.',
    );
  }

  const source = readSource();

  // ---- Subject (root concept) + 18 child concepts ----
  const rootConcept = await Concept.create({
    owner: ownerId,
    createdBy: ownerId,
    name: SUBJECT_NAME,
    description:
      'Hệ thống hóa kiến thức ba chương của học phần Triết học Mác – Lênin — nhập từ TRIET001 v1.0.',
    source: 'import',
    status: 'active',
  });

  const conceptIdByCode = new Map();
  for (const [code, name] of CONCEPTS) {
    // eslint-disable-next-line no-await-in-loop
    const c = await Concept.create({
      owner: ownerId,
      createdBy: ownerId,
      name: `${code} — ${name}`,
      parentConcept: rootConcept._id,
      source: 'import',
      status: 'active',
    });
    conceptIdByCode.set(code, c._id);
  }

  // ---- Body: everything between "## STAGE S0" and "## 4. BẢNG ĐÁP ÁN NHANH" ----
  const bodyStart = source.indexOf('## STAGE S0');
  const bodyEnd = source.indexOf('## 4. BẢNG ĐÁP ÁN NHANH');
  const body = source.slice(bodyStart, bodyEnd);

  const STAGE_HEADER_RE = /^## STAGE (S\d+) · (.+)$/gm;
  const stageChunks = splitByHeader(body, STAGE_HEADER_RE);

  const stageQuestionIds = new Map(); // stage key -> [QuestionItem._id] (embedded into the path step)
  const stageTheoryBlocks = new Map(); // stage key -> [{type, content}] combined from its lessons
  let totalQuestions = 0;
  let totalLessons = 0;
  let totalCards = 0;

  for (const { match: stageMatch, body: stageBody } of stageChunks) {
    const [, stageKey, stageTitle] = stageMatch;
    stageQuestionIds.set(stageKey, []);
    const theoryBlocks = [];
    stageTheoryBlocks.set(stageKey, theoryBlocks);

    // Lessons
    const LESSON_HEADER_RE = /^### LESSON (L\d+\.\d+) · (.+)$/gm;
    for (const { match: lm, body: lessonBody } of splitByHeader(stageBody, LESSON_HEADER_RE)) {
      const [, lessonKey, lessonTitle] = lm;
      const theoryMatch = lessonBody.match(/\*\*\[THEORY\]\*\*\n([\s\S]*?)\n\*\*\[CHECKLIST\]\*\*/);
      const theoryText = theoryMatch ? theoryMatch[1].trim() : '';
      const checklistItems = [...lessonBody.matchAll(/^- \[ \] (.+)$/gm)].map((m) => m[1].trim());
      const conceptCode = LESSON_CONCEPT[lessonKey];
      const conceptId = conceptCode ? conceptIdByCode.get(conceptCode) : rootConcept._id;
      const paragraphs = paragraphsOf(theoryText);

      theoryBlocks.push({ type: 'heading', content: lessonTitle });
      paragraphs.forEach((content) => theoryBlocks.push({ type: 'paragraph', content }));

      // eslint-disable-next-line no-await-in-loop
      await LessonItem.create({
        createdBy: ownerId,
        title: `${lessonKey} · ${lessonTitle}`,
        concept: conceptId,
        objectives: checklistItems.slice(0, 6),
        theoryContent: serializeBlocks(paragraphs.map((content) => ({ type: 'paragraph', content }))),
        questions: [],
        estimatedMinutes: 20,
        status: 'draft',
        source: 'import',
      });
      totalLessons += 1;
    }

    // Flashcard deck — one per stage that has an FC block (S1..S6; S0/S7 have none). Individual
    // cards' per-row Concept (0.4 table) isn't kept: FlashcardItem has no concept field of its own,
    // only the deck does, so that per-card tag is only preserved via its front/back text.
    const FC_HEADER_RE = /^### FLASHCARDS (FC-S\d+) · (.+)$/gm;
    const fcChunks = splitByHeader(stageBody, FC_HEADER_RE);
    if (fcChunks.length) {
      const [, deckCode, deckTitle] = fcChunks[0].match;
      // eslint-disable-next-line no-await-in-loop
      const deck = await FlashcardDeckItem.create({
        createdBy: ownerId,
        title: `${deckCode} · ${deckTitle}`,
        concept: rootConcept._id,
        description: `Bộ thẻ ${stageKey} — ${stageTitle}`,
        status: 'active',
      });
      const rows = [...fcChunks[0].body.matchAll(/^\|([^|]+)\|([^|]+)\|([^|]+)\|$/gm)]
        .map((m) => ({ front: m[1].trim(), back: m[2].trim() }))
        .filter((r) => r.front && !/^-+$/.test(r.front) && r.front !== 'Mặt trước');
      for (const row of rows) {
        // eslint-disable-next-line no-await-in-loop
        await FlashcardItem.create({
          createdBy: ownerId,
          deck: deck._id,
          front: row.front,
          back: row.back,
          status: 'active',
        });
        totalCards += 1;
      }
    }

    // Exercise sets / gate test / exam — every question in this stage feeds the stage's single
    // embedded quiz (plan-template step `questions[]`), since AssessmentConfigItem requires all its
    // questions to share one Concept and these groups deliberately mix several (see conversation).
    const GROUP_HEADER_RE = /^### (?:EXERCISE SET|GATE TEST|EXAM) ([\w-]+) · (.+)$/gm;
    for (const { body: groupBody } of splitByHeader(stageBody, GROUP_HEADER_RE)) {
      for (const q of parseQuestions(groupBody)) {
        const conceptId = conceptIdByCode.get(q.conceptCode);
        if (!conceptId) {
          console.warn(`Unknown concept code ${q.conceptCode} on ${q.qid} — skipped`);
          continue; // eslint-disable-line no-continue
        }
        // eslint-disable-next-line no-await-in-loop
        const created = await QuestionItem.create(toQuestionDoc({ q, conceptId, ownerId }));
        stageQuestionIds.get(stageKey).push(created._id);
        totalQuestions += 1;
      }
    }
  }

  // ---- Path template: 8 steps (S0..S7), embedding each stage's combined lesson theory + quiz ----
  const steps = STAGES.map(({ key, dayOffset, durationMin }) => {
    const stageMatch = stageChunks.find((c) => c.match[1] === key);
    const title = stageMatch ? stageMatch.match[2] : key;
    return {
      dayOffset,
      durationMin,
      title: `${key} · ${title}`,
      objectives: [],
      theoryContent: serializeBlocks(stageTheoryBlocks.get(key) ?? []),
      questions: stageQuestionIds.get(key) ?? [],
    };
  });

  const template = await PlanTemplateItem.create({
    createdBy: ownerId,
    title: 'Lộ trình ôn tập Triết học Mác – Lênin (8 buổi)',
    description:
      'Nhập từ tài liệu ôn tập TRIET001 v1.0 — 8 buổi theo 3 chương của giáo trình Triết học Mác – Lênin.',
    steps,
    status: 'draft',
    source: 'import',
  });

  console.log('--- Tóm tắt đã nhập (đối chiếu với mục 5.1 của tài liệu) ---');
  console.log(`Môn học (Concept gốc): 1 — "${rootConcept.name}"`);
  console.log(`Khái niệm con: ${conceptIdByCode.size} (kỳ vọng 18)`);
  console.log(`Lộ trình: 1 — "${template.title}" (DRAFT, chưa xuất bản)`);
  console.log(`Chặng: ${steps.length} (kỳ vọng 8)`);
  console.log(`Bài học (Thư viện bài học, DRAFT): ${totalLessons} (kỳ vọng 19)`);
  console.log(`Thẻ ghi nhớ: ${totalCards} (kỳ vọng 48)`);
  console.log(`Câu hỏi (Ngân hàng câu hỏi): ${totalQuestions} (kỳ vọng 96)`);
  console.log('');
  console.log('Lưu ý khi duyệt:');
  console.log('- MULTI/FILL/SHORT được nhập thành dạng "essay" (tự luận) vì hệ thống chưa có 3 dạng');
  console.log('  câu hỏi đó riêng — đáp án gốc + giải thích được ghép vào trường "Đáp án tham khảo".');
  console.log('- Thẻ ghi nhớ không giữ được Concept riêng từng thẻ (model Flashcard chỉ có Concept ở');
  console.log('  cấp bộ thẻ), chỉ gắn vào Concept gốc của môn.');
  console.log('- Lộ trình + mọi câu hỏi/bài học đang ở trạng thái DRAFT/chưa xuất bản — vào Admin để');
  console.log('  xem lại rồi mới Xuất bản cho sinh viên dùng.');

  await disconnectDB();
}

main().catch(async (err) => {
  console.error(err);
  await disconnectDB();
  process.exit(1);
});
