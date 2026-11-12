const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const ai = require('../../integrations/ai');
const AiAssistItem = require('./ai-assist.model');
const Concept = require('../knowledge/knowledge.model');

function tokenize(text) {
  return (text || '')
    .toLowerCase()
    .match(/[\p{L}\p{N}]+/gu) || [];
}

// Generates a draft MCQ for an admin to review/edit before saving it to the question bank.
async function generateQuestion(ownerId, { concept: conceptId, difficulty = 'medium' }) {
  const concept = await Concept.findById(conceptId);
  if (!concept) throw ApiError.badRequest('Concept not found', 'CONCEPT_NOT_FOUND');

  const prompt = `Generate a ${difficulty} multiple-choice question about "${concept.name}" with 4 options and 1 correct answer.`;
  const { answer } = await ai.ask(prompt);

  await AiAssistItem.create({ owner: ownerId, concept: conceptId, kind: 'generate_question', prompt, response: answer });

  return {
    concept: conceptId,
    difficulty,
    text: answer,
    options: [{ text: '', isCorrect: true }, { text: '' }, { text: '' }, { text: '' }],
  };
}

// shortcut: score is a cheap keyword-overlap heuristic, not Gemini itself (keeps grading fast/free at scale);
// only the written feedback goes through integrations/ai. Upgrade: ask Gemini for a numeric score too.
async function gradeEssay(ownerId, { conceptId, referenceAnswer, studentText }) {
  const refTokens = new Set(tokenize(referenceAnswer));
  const studentTokens = new Set(tokenize(studentText));
  const overlap = [...studentTokens].filter((t) => refTokens.has(t)).length;
  const scorePercent = refTokens.size === 0 ? 50 : Math.min(100, Math.round((overlap / refTokens.size) * 100));

  const prompt = `Grade this student answer against the reference answer and give short feedback.\nReference: ${referenceAnswer}\nStudent: ${studentText}`;
  const { answer: feedback } = await ai.ask(prompt);

  await AiAssistItem.create({ owner: ownerId, concept: conceptId, kind: 'grade_essay', prompt, response: feedback });

  return { scorePercent, feedback };
}

async function list(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { owner: ownerId };
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

module.exports = { generateQuestion, gradeEssay, list, getOwned };
