const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const AssessmentItem = require('./assessment.model');
const AssessmentConfigItem = require('../assessment-config/assessment-config.model');
const QuestionItem = require('../question-bank/question-bank.model');
const masteryService = require('../mastery/mastery.service');
const aiAssistService = require('../ai-assist/ai-assist.service');

async function start(ownerId, assessmentConfigId) {
  const config = await AssessmentConfigItem.findOne({ _id: assessmentConfigId, status: 'active' });
  if (!config) throw ApiError.notFound('Assessment config not found');

  return AssessmentItem.create({
    owner: ownerId,
    createdBy: ownerId,
    assessmentConfig: config._id,
    concept: config.concept,
  });
}

async function listForOwner(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { owner: ownerId, ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    AssessmentItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    AssessmentItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

// Personal data: ownership is always enforced, with no admin override (BR-02/BR-35).
async function getOwned(id, requesterId) {
  const item = await AssessmentItem.findById(id);
  if (!item) throw ApiError.notFound('Assessment not found');
  if (String(item.owner) !== String(requesterId)) throw ApiError.forbidden('Not the owner of this assessment');
  return item;
}

async function submit(id, requesterId, answers) {
  const attempt = await getOwned(id, requesterId);
  if (attempt.status !== 'in_progress') throw ApiError.conflict('Assessment already submitted');

  const config = await AssessmentConfigItem.findById(attempt.assessmentConfig);
  if (!config) throw ApiError.notFound('Assessment config not found');

  const questions = await QuestionItem.find({ _id: { $in: config.questions } });
  const questionById = new Map(questions.map((q) => [String(q._id), q]));

  // De-dupe by question id (last one wins) so a repeated id in the submitted answers — double
  // click, crafted request — can't double-count toward totalPoints/earnedTotal.
  const uniqueAnswers = [...new Map(answers.map((a) => [a.question, a])).values()];
  const matched = uniqueAnswers
    .map((answer) => ({ answer, question: questionById.get(answer.question) }))
    .filter((m) => m.question);
  const totalPoints = matched.reduce((sum, m) => sum + m.question.points, 0);

  // Essay grading calls the AI service, which itself calls out to Gemini — run those concurrently
  // instead of serializing one AI round-trip per essay question.
  const gradedAnswers = await Promise.all(
    matched.map(async ({ answer, question }) => {
      if (question.type === 'mcq') {
        const selected = question.options[answer.selectedOptionIndex];
        const isCorrect = Boolean(selected?.isCorrect);
        const earnedPoints = isCorrect ? question.points : 0;
        return { ...answer, isCorrect, earnedPoints, feedback: '' };
      }

      const { scorePercent, feedback } = await aiAssistService.gradeEssay(requesterId, {
        conceptId: attempt.concept,
        referenceAnswer: question.referenceAnswer,
        studentText: answer.essayText,
      });
      const earnedPoints = Math.round((question.points * scorePercent) / 100);
      return { ...answer, isCorrect: scorePercent >= 50, earnedPoints, feedback };
    }),
  );
  const earnedTotal = gradedAnswers.reduce((sum, a) => sum + a.earnedPoints, 0);

  attempt.answers = gradedAnswers;
  attempt.score = totalPoints === 0 ? 0 : Math.round((earnedTotal / totalPoints) * 100);
  attempt.passed = attempt.score >= config.passScore;
  attempt.status = 'submitted';
  attempt.submittedAt = new Date();
  attempt.updatedBy = requesterId;
  await attempt.save();

  await masteryService.upsertForAttempt(requesterId, attempt.concept, attempt.score);

  return attempt;
}

module.exports = { start, listForOwner, getOwned, submit };
