const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const ai = require('../../integrations/ai');
const AiAssistItem = require('./ai-assist.model');
const Concept = require('../knowledge/knowledge.model');
const AssessmentItem = require('../assessment/assessment.model');
const QuestionItem = require('../question-bank/question-bank.model');
const assessmentConfigService = require('../assessment-config/assessment-config.service');
const masteryService = require('../mastery/mastery.service');

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

async function generateDraft(ownerId, { concept: conceptId, difficulty = 'medium' }, kind) {
  const concept = await Concept.findById(conceptId);
  if (!concept) throw ApiError.badRequest('Concept not found', 'CONCEPT_NOT_FOUND');

  const prompt = `Generate a ${difficulty} multiple-choice question about "${concept.name}". ${MCQ_FORMAT_INSTRUCTIONS}`;
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
    ? `\nGrade against this rubric:\n${rubric.criteria.map((c) => `- ${c.name} (max ${c.maxPoints}): ${c.description}`).join('\n')}`
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
async function essayFeedback(ownerId, { conceptId, questionText, answerText }) {
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
  return { feedback };
}

// UC-AIA-02: grounded Q&A — "source" is the matched concept's own description until a document store
// (SUB module) exists to cite from directly.
async function askWithSource(ownerId, { question, concept: conceptId }) {
  let concept = conceptId ? await Concept.findById(conceptId) : null;
  if (!concept) {
    const terms = tokenize(question);
    concept = terms.length
      ? await Concept.findOne({ status: 'active', name: new RegExp(terms[0], 'i') })
      : null;
  }

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

async function list(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { owner: ownerId, ...(query.kind ? { kind: query.kind } : {}) };
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

module.exports = {
  validateGeneratedQuestionShape,
  buildPersonalizationContext,
  generateQuestion,
  practiceQuestion,
  gradeEssay,
  essayFeedback,
  askWithSource,
  explainWrong,
  list,
  getOwned,
  removeOwned,
  rate,
  report,
};
