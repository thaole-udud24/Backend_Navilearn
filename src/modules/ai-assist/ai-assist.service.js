const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const ai = require('../../integrations/ai');
const env = require('../../config/env');
const AiAssistItem = require('./ai-assist.model');
const Concept = require('../knowledge/knowledge.model');
const knowledgeService = require('../knowledge/knowledge.service');
const AssessmentItem = require('../assessment/assessment.model');
const QuestionItem = require('../question-bank/question-bank.model');
const assessmentConfigService = require('../assessment-config/assessment-config.service');
const masteryService = require('../mastery/mastery.service');
const planningService = require('../planning/planning.service');
const { resolveSubjectConceptIds } = require('../../shared/subjectFilter');
const aiHelpService = require('./ai-help.service');

const OPTION_LETTERS = ['A', 'B', 'C', 'D'];

function tokenize(text) {
  return (text || '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
}

// UC-AP-AIA-04: parses the model's fixed-format MCQ response and checks it is well-formed and has
// exactly one correct answer before it ever reaches an admin for review.
function validateGeneratedQuestionShape(raw) {
  const lines = String(raw || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  const qLine = lines.find((l) => /^Q:/i.test(l));
  const correctLine = lines.find((l) => /^CORRECT:/i.test(l));
  const optionLines = OPTION_LETTERS.map((letter) => lines.find((l) => new RegExp(`^${letter}\\)`).test(l)));

  if (!qLine || !correctLine || optionLines.some((l) => !l)) {
    return { valid: false, text: qLine ? qLine.replace(/^Q:\s*/i, '') : '', options: [] };
  }

  const correctLetter = correctLine
    .replace(/^CORRECT:\s*/i, '')
    .trim()
    .toUpperCase();
  const correctIndex = OPTION_LETTERS.indexOf(correctLetter);
  if (correctIndex === -1) return { valid: false, text: qLine.replace(/^Q:\s*/i, ''), options: [] };

  const options = optionLines.map((l, idx) => ({
    text: l.replace(/^[A-D]\)\s*/, '').trim(),
    isCorrect: idx === correctIndex,
  }));
  if (options.some((o) => !o.text)) return { valid: false, text: qLine.replace(/^Q:\s*/i, ''), options: [] };

  return { valid: true, text: qLine.replace(/^Q:\s*/i, ''), options };
}

const MCQ_FORMAT_INSTRUCTIONS =
  'Respond in exactly this format, nothing else:\nQ: <question text>\nA) <option>\nB) <option>\nC) <option>\nD) <option>\nCORRECT: <letter A-D>';

// UC-AIA-05: folds the student's current Learning State into the prompt so explanations/answers land
// at the right depth instead of being generic.
async function buildPersonalizationContext(ownerId, conceptId) {
  if (!conceptId || !mongoose.Types.ObjectId.isValid(conceptId)) return '';
  const record = await masteryService.findRaw(ownerId, conceptId);
  if (!record) return '';
  return `Student's current mastery for this concept: ${record.level} (${record.score}%). Adjust depth accordingly.`;
}

async function generateDraft(ownerId, { concept: conceptId, difficulty = 'medium', assessmentItemId }, kind) {
  const concept = await Concept.findById(conceptId);
  if (!concept) throw ApiError.badRequest('Concept not found', 'CONCEPT_NOT_FOUND');

  const prompt = `Generate a ${difficulty} multiple-choice question about "${concept.name}". ${MCQ_FORMAT_INSTRUCTIONS}`;
  if (kind === 'practice_question') {
    await aiHelpService.assertActiveAttempt(ownerId, assessmentItemId, conceptId);
  }
  const { answer } = await ai.ask(prompt);
  const { valid, text, options } = validateGeneratedQuestionShape(answer);

  const log = await AiAssistItem.create({
    owner: ownerId,
    concept: conceptId,
    kind,
    prompt,
    response: answer,
    valid,
  });
  if (kind === 'practice_question' && valid) {
    await aiHelpService.recordHelp(ownerId, assessmentItemId, conceptId, kind);
  }
  return { aiAssistLogId: log.id, concept: conceptId, difficulty, valid, text, options };
}

// UC-QBK-09 source: admin asks for a draft to review before adding it to the shared bank.
async function generateQuestion(ownerId, input) {
  return generateDraft(ownerId, input, 'generate_question');
}

// UC-AIA-09: student asks for an ad-hoc practice question; not saved to the bank.
async function practiceQuestion(ownerId, input) {
  return generateDraft(ownerId, input, 'practice_question');
}

// shortcut: score is a cheap keyword-overlap heuristic, not Gemini itself (keeps grading fast/free at
// scale); only the written feedback goes through integrations/ai. Upgrade: ask Gemini for a numeric
// score too once accuracy on the heuristic proves insufficient.
async function gradeEssay(ownerId, { conceptId, referenceAnswer, studentText }) {
  const refTokens = new Set(tokenize(referenceAnswer));
  const studentTokens = new Set(tokenize(studentText));
  const overlap = [...studentTokens].filter((t) => refTokens.has(t)).length;
  const scorePercent =
    refTokens.size === 0 ? 50 : Math.min(100, Math.round((overlap / refTokens.size) * 100));

  const rubric =
    conceptId && mongoose.Types.ObjectId.isValid(conceptId)
      ? await assessmentConfigService.findActiveRubricForConcept(conceptId)
      : null;
  const rubricText = rubric
    ? `\nGrade against this rubric (total ${rubric.totalPoints} points):\n${rubric.criteria
        .map(
          (c) =>
            `- ${c.name} (${c.weightPct}%, max ${assessmentConfigService.criterionPoints(rubric, c)} points): ${c.description}`,
        )
        .join('\n')}`
    : '';
  const prompt = `Grade this student answer against the reference answer and give short feedback.\nReference: ${referenceAnswer}\nStudent: ${studentText}${rubricText}`;
  const { answer: feedback } = await ai.ask(prompt);

  await AiAssistItem.create({
    owner: ownerId,
    concept: conceptId,
    kind: 'grade_essay',
    prompt,
    response: feedback,
  });

  return { scorePercent, feedback, rubricApplied: Boolean(rubric) };
}

// UC-AIA-11: a standalone "what would the AI say" preview — does not touch any grade or attempt.
async function essayFeedback(ownerId, { conceptId, questionText, answerText, assessmentItemId }) {
  await aiHelpService.assertActiveAttempt(ownerId, assessmentItemId, conceptId);
  const personalization = await buildPersonalizationContext(ownerId, conceptId);
  const prompt = `Give short, constructive feedback on this essay answer.\nQuestion: ${questionText}\nAnswer: ${answerText}\n${personalization}`;
  const { answer: feedback } = await ai.ask(prompt);
  await AiAssistItem.create({
    owner: ownerId,
    concept: conceptId ?? null,
    kind: 'essay_feedback',
    prompt,
    response: feedback,
  });
  await aiHelpService.recordHelp(ownerId, assessmentItemId, conceptId, 'essay_feedback');
  return { feedback };
}

// UC-AIA-02: grounded Q&A — "source" is the matched concept's own description until a document store
// (SUB module) exists to cite from directly.
async function askWithSource(ownerId, { question, concept: conceptId, assessmentItemId }) {
  let concept = conceptId ? await Concept.findById(conceptId) : null;
  if (!concept) {
    const terms = tokenize(question);
    concept = terms.length
      ? await Concept.findOne({ status: 'active', name: new RegExp(terms[0], 'i') })
      : null;
  }

  await aiHelpService.assertActiveAttempt(ownerId, assessmentItemId, concept?.id);
  const personalization = await buildPersonalizationContext(ownerId, concept?.id);
  const groundingText = concept
    ? `Source material: "${concept.name}" — ${concept.description || '(no description)'}`
    : '';
  const prompt = `Answer the student's question using the source material when relevant, and say what you used.\nQuestion: ${question}\n${groundingText}\n${personalization}`;
  const { answer } = await ai.ask(prompt);

  const sources = concept ? [{ concept: concept.id, label: concept.name }] : [];
  await AiAssistItem.create({
    owner: ownerId,
    concept: concept?.id ?? null,
    kind: 'qa',
    prompt,
    response: answer,
    sources,
  });
  await aiHelpService.recordHelp(ownerId, assessmentItemId, concept?.id, 'qa');

  return { answer, sources };
}

// UC-AIA-03: explains one wrong answer from a graded attempt. Reads AssessmentItem directly (not via
// assessment.service) to avoid a require cycle between the two modules.
async function explainWrong(ownerId, { assessmentItemId, question: questionId }) {
  const attempt = await AssessmentItem.findById(assessmentItemId);
  if (!attempt) throw ApiError.notFound('Assessment not found');
  if (String(attempt.owner) !== String(ownerId)) throw ApiError.forbidden('Not the owner of this assessment');

  const answer = attempt.answers.find((a) => String(a.question) === String(questionId));
  if (!answer) throw ApiError.notFound('Answer not found on this assessment');
  if (answer.isCorrect)
    throw ApiError.badRequest('This answer was correct; nothing to explain', 'ANSWER_NOT_WRONG');

  const question = await QuestionItem.findById(questionId);
  if (!question) throw ApiError.notFound('Question not found');

  const personalization = await buildPersonalizationContext(ownerId, question.concept);
  const studentAnswer =
    answer.essayText || (question.options?.[answer.selectedOptionIndex]?.text ?? '(no answer)');
  const prompt = `Explain why this answer is wrong and guide the student to the right idea, with a source reference.\nQuestion: ${question.text}\nStudent answer: ${studentAnswer}\nReference answer: ${question.referenceAnswer || question.options?.find((o) => o.isCorrect)?.text || ''}\n${personalization}`;
  const { answer: explanation } = await ai.ask(prompt);

  await AiAssistItem.create({
    owner: ownerId,
    concept: question.concept,
    kind: 'explain_wrong',
    prompt,
    response: explanation,
    sources: [{ concept: question.concept, label: 'question reference answer' }],
  });

  return { explanation };
}

const CONCEPT_NAME_LINE = /^NAME:\s*(.+)$/i;
const CONCEPT_DESCRIPTION_LINE = /^DESCRIPTION:\s*(.+)$/i;

// UC-KNW-AI-01: admin asks AI to draft a new knowledge-map concept; admin still reviews and
// creates it for real via knowledge.service — this only proposes, never writes to Concept.
async function generateConceptDraft(ownerId, { topic }) {
  const prompt =
    `Đề xuất một khái niệm/chủ đề kiến thức mới liên quan tới: "${topic}".\n` +
    'Trả lời CHÍNH XÁC theo định dạng này, không thêm chữ nào khác:\n' +
    'NAME: <tên khái niệm, ngắn gọn>\n' +
    'DESCRIPTION: <mô tả ngắn 1-2 câu>';

  const { answer } = await ai.ask(prompt);
  const lines = String(answer || '')
    .split('\n')
    .map((l) => l.trim());
  const name =
    lines
      .find((l) => CONCEPT_NAME_LINE.test(l))
      ?.match(CONCEPT_NAME_LINE)?.[1]
      ?.trim() ?? '';
  const description =
    lines
      .find((l) => CONCEPT_DESCRIPTION_LINE.test(l))
      ?.match(CONCEPT_DESCRIPTION_LINE)?.[1]
      ?.trim() ?? '';
  const valid = Boolean(name);

  const log = await AiAssistItem.create({
    owner: ownerId,
    kind: 'generate_concept',
    prompt,
    response: answer,
    valid,
  });

  // shortcut: falls back to the raw topic as the name when AI misses the format, so the admin
  // always has something reviewable instead of an empty draft.
  return { aiAssistLogId: log.id, topic, valid, name: name || topic, description };
}

const TEMPLATE_STEP_LINE =
  /^DAY:\s*(\d+)\s*\|\s*DURATION:\s*(\d+)\s*\|\s*THEORY:\s*(.*?)\s*\|\s*NOTE:\s*(.+)$/i;

function parseGeneratedTemplateSteps(raw) {
  return String(raw || '')
    .split('\n')
    .map((l) => l.trim())
    .map((l) => l.match(TEMPLATE_STEP_LINE))
    .filter(Boolean)
    .map((m) => ({
      dayOffset: Math.min(60, Math.max(1, Number(m[1]))),
      durationMin: Math.min(180, Math.max(15, Number(m[2]))),
      theoryContent: m[3].trim().slice(0, 4000),
      note: m[4].trim().slice(0, 300),
    }));
}

// UC-PLN-TPL-04: admin asks AI to draft a whole plan-template (title + steps with theory) instead
// of typing every step by hand; admin still reviews/edits before saving (same review-then-create
// pattern as generateConceptDraft/generateQuestion — this only proposes, never writes the template).
async function generateTemplateDraft(ownerId, { topic, conceptId, sessionCount = 4 }) {
  const concept = conceptId ? await Concept.findById(conceptId) : null;
  const subject = concept ? concept.name : topic;

  const prompt =
    `Thiết kế một lộ trình ôn tập gồm đúng ${sessionCount} buổi cho chủ đề: "${subject}".\n` +
    'Trả lời CHÍNH XÁC theo định dạng này, mỗi buổi một dòng, không thêm chữ nào khác:\n' +
    'DAY: <số ngày kể từ lúc bắt đầu, 1-60> | DURATION: <phút, 15-120> | THEORY: <tóm tắt lý thuyết ngắn 1-2 câu> | NOTE: <hoạt động ngắn bằng tiếng Việt>';

  const { answer } = await ai.ask(prompt);
  let steps = parseGeneratedTemplateSteps(answer);
  const valid = steps.length > 0;

  // shortcut: AI trả sai định dạng -> lộ trình dự phòng chia đều buổi học, để luồng không bị kẹt.
  if (!valid) {
    steps = Array.from({ length: sessionCount }, (_, i) => ({
      dayOffset: (i + 1) * 2,
      durationMin: 30,
      theoryContent: '',
      note: `Ôn tập ${subject}`,
    }));
  }

  const log = await AiAssistItem.create({
    owner: ownerId,
    concept: conceptId ?? null,
    kind: 'generate_template',
    prompt,
    response: answer,
    valid,
  });

  return {
    aiAssistLogId: log.id,
    valid,
    title: `Lộ trình ${subject}`,
    description: `Lộ trình do AI đề xuất cho chủ đề "${subject}".`,
    steps,
  };
}

// `CONCEPT:` is optional in the line so a plain 3-field response (no leaf list was offered, or the
// AI ignored the extra field) still parses — see generateStudyPlan below.
const PLAN_SESSION_LINE =
  /^DAY:\s*(\d+)\s*\|\s*DURATION:\s*(\d+)\s*(?:\|\s*CONCEPT:\s*(\S+)\s*)?\|\s*NOTE:\s*(.+)$/i;

// `validLeafIds`, when given, is the exact set of real descendant leaf Concept ids the AI was
// offered — a `CONCEPT:` tag is only trusted (kept, otherwise `null`) when it is one of those ids,
// never a bare well-formed-looking ObjectId the model invented (UC-PLN-AI-01 real-leaf-concept fix).
function parseGeneratedSessions(raw, validLeafIds) {
  const leafSet = validLeafIds ? new Set(Array.from(validLeafIds, String)) : null;
  return String(raw || '')
    .split('\n')
    .map((l) => l.trim())
    .map((l) => l.match(PLAN_SESSION_LINE))
    .filter(Boolean)
    .map((m) => {
      const tagged = m[3] && /^[a-f\d]{24}$/i.test(m[3]) ? m[3] : null;
      return {
        dayOffset: Math.min(60, Math.max(1, Number(m[1]))),
        durationMin: Math.min(180, Math.max(15, Number(m[2]))),
        concept: tagged && (!leafSet || leafSet.has(tagged)) ? tagged : null,
        note: m[4].trim().slice(0, 300),
      };
    });
}

// UC-PLN-AI-01: student turns a goal into a concrete proposed study plan (BR-12 personalization);
// the student still confirms it (BR-37/BR-54) before it becomes active, same as an ADP replan.
async function generateStudyPlan(ownerId, goalId) {
  const goal = await planningService.getOwnedGoal(goalId, { id: ownerId });
  const concept = await Concept.findById(goal.concept);
  if (!concept) throw ApiError.badRequest('Concept not found', 'CONCEPT_NOT_FOUND');

  const daysLeft = Math.max(1, Math.ceil((new Date(goal.deadline).getTime() - Date.now()) / 86400000));
  const sessionCount = Math.min(6, Math.max(2, Math.round(daysLeft / 3)));
  const personalization = await buildPersonalizationContext(ownerId, goal.concept);

  // UC-PLN-AI-01 real-leaf-concept fix: this generator has no real content references (lesson/
  // question ids) to pull a leaf Concept from like the template path does, so the only real data
  // available is the subject's own 4-level knowledge tree — offer the AI the goal subject's actual
  // leaf Concepts and ask it to tag each session with one; the tag is validated against this exact
  // list below (never trusted blindly). A step it doesn't/can't tag keeps the root subject concept,
  // same as before — never a faked leaf. shortcut: capped at 40 leaves so the prompt stays bounded
  // for very large subjects.
  const leafIds = await knowledgeService.getDescendantLeafIds(goal.concept);
  const leaves = leafIds.length ? await Concept.find({ _id: { $in: leafIds } }, 'name').limit(40) : [];
  const leafListLine = leaves.length
    ? `\nDanh sách kiến thức cụ thể của môn (chọn đúng 1 ID phù hợp nhất cho mỗi buổi):\n${leaves
        .map((c) => `${c._id} | ${c.name}`)
        .join('\n')}\n`
    : '';
  const conceptFieldFormat = leaves.length ? ' | CONCEPT: <ID kiến thức phù hợp nhất ở trên>' : '';

  const prompt =
    `Tạo lộ trình học gồm đúng ${sessionCount} buổi để đạt mục tiêu "${goal.title}" cho chủ đề "${concept.name}" trong ${daysLeft} ngày tới.\n` +
    `${personalization}${leafListLine}\n` +
    'Trả lời CHÍNH XÁC theo định dạng này, mỗi buổi một dòng, không thêm chữ nào khác:\n' +
    `DAY: <số ngày kể từ hôm nay, 1-60> | DURATION: <phút, 15-120>${conceptFieldFormat} | NOTE: <hoạt động ngắn bằng tiếng Việt>`;

  const { answer } = await ai.ask(prompt);
  let parsed = parseGeneratedSessions(answer, leafIds);
  const valid = parsed.length > 0;

  // shortcut: AI trả sai định dạng -> chia đều buổi học còn lại, để luồng không bị kẹt.
  if (!valid) {
    parsed = Array.from({ length: sessionCount }, (_, i) => ({
      dayOffset: Math.max(1, Math.round(((i + 1) * daysLeft) / sessionCount)),
      durationMin: 30,
      concept: null,
      note: `Ôn tập ${concept.name}`,
    }));
  }

  const sessions = parsed.map(({ dayOffset, durationMin, note, concept: leafConcept }) => {
    const startAt = new Date();
    startAt.setDate(startAt.getDate() + dayOffset);
    startAt.setHours(19, 0, 0, 0);
    // Real leaf concept when the AI validly tagged one; otherwise fall back to the goal's own root
    // subject concept, exactly as before.
    return { concept: leafConcept || goal.concept, startAt, durationMin, note };
  });

  const plan = await planningService.create(ownerId, {
    title: `Lộ trình AI: ${goal.title}`,
    status: 'proposed',
    goal: goalId,
    sessions,
  });

  await AiAssistItem.create({
    owner: ownerId,
    concept: goal.concept,
    kind: 'generate_plan',
    prompt,
    response: answer,
    valid,
  });

  return { plan, valid };
}

function normalizeDraftText(text) {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

// A5 "Review Workspace": just-generated, not-yet-approved 'generate_question' drafts, each with the
// real flags that exist for it — `valid` is the actual UC-AP-AIA-04 format check (re-derived from the
// stored raw response, same parser used at generation time), `possibleDuplicate` is a live exact-text
// match against the active bank for the same concept (same heuristic as question-bank's UC-QBK-13
// findDuplicates). No fabricated duplicate percentage — only this boolean, honestly computed.
async function listQuestionDrafts({ limit = 50 } = {}) {
  const drafts = await AiAssistItem.find({ kind: 'generate_question', approvedQuestion: null })
    .sort({ createdAt: -1 })
    .limit(Math.max(1, Math.min(Number(limit) || 50, 200)))
    .populate('owner', 'fullName email')
    .populate('concept', 'name');

  const activeTextsByConcept = new Map();
  for (const draft of drafts) {
    const conceptId = draft.concept ? String(draft.concept._id ?? draft.concept) : null;
    if (!conceptId || activeTextsByConcept.has(conceptId)) continue;
    // eslint-disable-next-line no-await-in-loop
    const actives = await QuestionItem.find({ status: 'active', concept: conceptId }).select('text');
    activeTextsByConcept.set(conceptId, new Set(actives.map((q) => normalizeDraftText(q.text))));
  }

  return drafts.map((draft) => {
    const { valid, text, options } = validateGeneratedQuestionShape(draft.response);
    const conceptId = draft.concept ? String(draft.concept._id ?? draft.concept) : null;
    const possibleDuplicate = Boolean(
      text && conceptId && activeTextsByConcept.get(conceptId)?.has(normalizeDraftText(text)),
    );
    return {
      aiAssistLogId: draft.id,
      owner: draft.owner,
      concept: draft.concept,
      createdAt: draft.createdAt,
      valid,
      possibleDuplicate,
      text,
      options,
    };
  });
}

// Admin rejects a draft from the Review Workspace: soft-deletes the log (same mechanism
// removeOwned uses for a student's own log) so it drops out of the pending queue for good.
async function rejectQuestionDraft(id, adminId) {
  const log = await AiAssistItem.findById(id);
  if (!log || log.kind !== 'generate_question') throw ApiError.notFound('Question draft not found');
  log.updatedBy = adminId;
  await log.softDelete();
}

async function list(ownerId, query, requester) {
  const { page, limit, skip } = parsePagination(query);
  const subjectIds = await resolveSubjectConceptIds(query.subjectId, requester);
  const filter = {
    owner: ownerId,
    ...(query.kind ? { kind: query.kind } : {}),
    ...(subjectIds ? { concept: { $in: subjectIds } } : {}),
  };
  const [items, total] = await Promise.all([
    AiAssistItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    AiAssistItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getOwned(id, requesterId) {
  const item = await AiAssistItem.findById(id);
  if (!item) throw ApiError.notFound('Log not found');
  if (String(item.owner) !== String(requesterId)) throw ApiError.forbidden('Not the owner of this log');
  return item;
}

// UC-AIA-04: student-facing "delete" is a soft hide; the audit trail (plugin) still holds the record.
async function removeOwned(id, requesterId) {
  const item = await getOwned(id, requesterId);
  await item.softDelete();
}

// UC-AIA-12
async function rate(id, requesterId, { rating, comment }) {
  const item = await getOwned(id, requesterId);
  item.rating = rating;
  item.ratingComment = comment ?? '';
  await item.save();
  return item;
}

// UC-AIA-13
async function report(id, requesterId, { reason }) {
  const item = await getOwned(id, requesterId);
  item.reported = true;
  item.reportReason = reason;
  item.reportedAt = new Date();
  await item.save();
  return item;
}

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

// B6 "Giám sát" (admin-only): real operational data only — no invented queue/latency metrics.
// AiAssistItem is this codebase's one real async-task log (closest thing to the business doc's
// 3.0.2 ai_request concept); it has no duration/error field, so status is derived honestly from
// `valid` (format check passed) and `reported` (student flagged the answer), not fabricated.
async function adminOverview() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const [totalLast24h, invalidLast24h, reportedLast24h, recent] = await Promise.all([
    AiAssistItem.countDocuments({ createdAt: { $gte: since24h } }),
    AiAssistItem.countDocuments({ createdAt: { $gte: since24h }, valid: false }),
    AiAssistItem.countDocuments({ createdAt: { $gte: since24h }, reported: true }),
    AiAssistItem.find({})
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('owner', 'fullName email')
      .populate('concept', 'name'),
  ]);

  return {
    health: {
      dbConnected: mongoose.connection.readyState === 1,
      dbState: DB_STATES[mongoose.connection.readyState] || 'unknown',
      uptimeSec: Math.round(process.uptime()),
    },
    // express-rate-limit keeps per-IP counters in-memory with no public read API, so this reports
    // the real configured policy (not a fabricated "remaining quota" gauge).
    rateLimit: {
      scope: 'auth (đăng ký/đăng nhập/quên mật khẩu...)',
      windowMs: env.RATE_LIMIT_WINDOW_MS,
      max: env.RATE_LIMIT_MAX,
    },
    aiRequests: { totalLast24h, invalidLast24h, reportedLast24h, recent },
  };
}

module.exports = {
  adminOverview,
  listQuestionDrafts,
  rejectQuestionDraft,
  validateGeneratedQuestionShape,
  parseGeneratedSessions,
  buildPersonalizationContext,
  generateQuestion,
  practiceQuestion,
  gradeEssay,
  essayFeedback,
  askWithSource,
  explainWrong,
  generateStudyPlan,
  generateConceptDraft,
  generateTemplateDraft,
  parseGeneratedTemplateSteps,
  list,
  getOwned,
  removeOwned,
  rate,
  report,
};
