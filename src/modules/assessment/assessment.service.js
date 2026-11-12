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

  if (config.retryPolicy?.maxAttempts > 0) {
    const attemptCount = await AssessmentItem.countDocuments({
      owner: ownerId,
      assessmentConfig: config._id,
    });
    if (attemptCount >= config.retryPolicy.maxAttempts) {
      throw ApiError.conflict('Maximum attempts reached for this assessment', 'MAX_ATTEMPTS_REACHED');
    }
  }

  return AssessmentItem.create({
    owner: ownerId,
    createdBy: ownerId,
    assessmentConfig: config._id,
    concept: config.concept,
  });
}

async function listForOwner(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {
    owner: ownerId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.concept ? { concept: query.concept } : {}), // UC-ASM-02: history filtered by concept
  };
  const [items, total] = await Promise.all([
    AssessmentItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    AssessmentItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

// Personal data: ownership is always enforced, with no admin override (BR-02/BR-35).
async function getOwnedRaw(id, requesterId) {
  const item = await AssessmentItem.findById(id);
  if (!item) throw ApiError.notFound('Assessment not found');
  if (String(item.owner) !== String(requesterId))
    throw ApiError.forbidden('Not the owner of this assessment');
  return item;
}

// UC-ASM-03: enriches a submitted attempt's answers with the question text and, per the config's
// showAnswersPolicy, the correct answer — not shown for in-progress attempts or policy 'never'.
async function getOwned(id, requester) {
  const item = await getOwnedRaw(id, requester.id);
  if (item.status !== 'submitted') return item;

  const config = await AssessmentConfigItem.findById(item.assessmentConfig);
  const revealAnswers = (config?.showAnswersPolicy ?? 'after_submit') === 'after_submit';
  const questions = await QuestionItem.find({ _id: item.answers.map((a) => a.question) });
  const questionById = new Map(questions.map((q) => [String(q._id), q]));

  const plain = item.toObject();
  plain.answers = plain.answers.map((a) => {
    const q = questionById.get(String(a.question));
    return {
      ...a,
      questionText: q?.text ?? '',
      correctAnswer: revealAnswers
        ? q?.referenceAnswer || q?.options?.find((o) => o.isCorrect)?.text
        : undefined,
    };
  });
  return plain;
}

// UC-ASM-04
async function getWrongAnswers(id, requester) {
  const item = await getOwned(id, requester);
  const answers = (item.answers ?? []).filter((a) => !a.isCorrect);
  return { assessment: item._id ?? id, concept: item.concept, wrongAnswers: answers };
}

// UC-ASM-05
async function compareAttempts(ownerId, conceptId) {
  const items = await AssessmentItem.find({ owner: ownerId, concept: conceptId, status: 'submitted' })
    .sort({ submittedAt: 1 })
    .select('score passed submittedAt');
  const attempts = items.map((i) => ({
    id: i._id,
    score: i.score,
    passed: i.passed,
    submittedAt: i.submittedAt,
  }));
  const deltaFromFirst = attempts.length > 1 ? attempts[attempts.length - 1].score - attempts[0].score : 0;
  return { concept: conceptId, attempts, deltaFromFirst };
}

// UC-ASM-06
async function getScoreHistory(id, requester) {
  const item = await getOwnedRaw(id, requester.id);
  return item.scoreHistory;
}

// UC-ASM-17: mark/unmark one question for review without grading it.
async function setFlag(id, requesterId, questionId, flagged) {
  const item = await getOwnedRaw(id, requesterId);
  if (item.status !== 'in_progress') throw ApiError.conflict('Assessment already submitted');
  let answer = item.answers.find((a) => String(a.question) === String(questionId));
  if (!answer) {
    item.answers.push({ question: questionId, flagged });
  } else {
    answer.flagged = flagged;
  }
  await item.save();
  return item;
}

// UC-ASM-18: saves partial answers for an in-progress attempt without grading or finalizing it.
async function saveDraft(id, requesterId, draftAnswers) {
  const item = await getOwnedRaw(id, requesterId);
  if (item.status !== 'in_progress') throw ApiError.conflict('Assessment already submitted');

  draftAnswers.forEach((draft) => {
    let answer = item.answers.find((a) => String(a.question) === String(draft.question));
    if (!answer) {
      item.answers.push({ question: draft.question });
      answer = item.answers[item.answers.length - 1];
    }
    if (draft.selectedOptionIndex !== undefined) answer.selectedOptionIndex = draft.selectedOptionIndex;
    if (draft.essayText !== undefined) answer.essayText = draft.essayText;
  });
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

async function gradeAnswers(answers, questionById, requesterId, conceptId) {
  let totalPoints = 0;
  let earnedTotal = 0;
  const gradedAnswers = [];

  for (const answer of answers) {
    const question = questionById.get(String(answer.question));
    if (!question) continue;
    totalPoints += question.points;

    if (question.type === 'mcq') {
      const selected = question.options[answer.selectedOptionIndex];
      const isCorrect = Boolean(selected?.isCorrect);
      const earnedPoints = isCorrect ? question.points : 0;
      earnedTotal += earnedPoints;
      gradedAnswers.push({ ...answer, isCorrect, earnedPoints, feedback: '' });
    } else {
      // eslint-disable-next-line no-await-in-loop
      const { scorePercent, feedback } = await aiAssistService.gradeEssay(requesterId, {
        conceptId,
        referenceAnswer: question.referenceAnswer,
        studentText: answer.essayText,
      });
      const earnedPoints = Math.round((question.points * scorePercent) / 100);
      earnedTotal += earnedPoints;
      gradedAnswers.push({ ...answer, isCorrect: scorePercent >= 50, earnedPoints, feedback });
    }
  }

  return { gradedAnswers, score: totalPoints === 0 ? 0 : Math.round((earnedTotal / totalPoints) * 100) };
}

async function submit(id, requesterId, answers) {
  const attempt = await getOwnedRaw(id, requesterId);
  if (attempt.status !== 'in_progress') throw ApiError.conflict('Assessment already submitted');

  const config = await AssessmentConfigItem.findById(attempt.assessmentConfig);
  const allowedQuestionIds =
    attempt.questionsOverride.length > 0
      ? attempt.questionsOverride.map(String)
      : config.questions.map(String);
  const filteredAnswers = answers.filter((a) => allowedQuestionIds.includes(String(a.question)));

  const questions = await QuestionItem.find({ _id: { $in: allowedQuestionIds } });
  const questionById = new Map(questions.map((q) => [String(q._id), q]));

  const flagByQuestion = new Map(attempt.answers.map((a) => [String(a.question), a.flagged]));
  const { gradedAnswers, score } = await gradeAnswers(
    filteredAnswers,
    questionById,
    requesterId,
    attempt.concept,
  );

  attempt.answers = gradedAnswers.map((a) => ({
    ...a,
    flagged: flagByQuestion.get(String(a.question)) ?? false,
  }));
  attempt.score = score;
  attempt.passed = score >= config.passScore;
  attempt.status = 'submitted';
  attempt.submittedAt = new Date();
  attempt.updatedBy = requesterId;
  attempt.scoreHistory.push({ score, reason: 'initial_grading', changedBy: requesterId });
  await attempt.save();

  await masteryService.upsertForAttempt(requesterId, attempt.concept, attempt.score, 'initial_grading');
  if (config.kind === 'placement') {
    await masteryService.initializeFromPlacement(requesterId, [
      { concept: attempt.concept, scorePercent: score },
    ]);
  }

  return attempt;
}

// UC-ASM-13: a fresh attempt scoped to only the questions the student got wrong last time.
async function startRetryWrong(ownerId, previousAttemptId) {
  const previous = await getOwnedRaw(previousAttemptId, ownerId);
  if (previous.status !== 'submitted') throw ApiError.conflict('Previous attempt is not submitted yet');
  const wrongQuestionIds = previous.answers.filter((a) => !a.isCorrect).map((a) => a.question);
  if (wrongQuestionIds.length === 0)
    throw ApiError.badRequest('No wrong answers to retry', 'NOTHING_TO_RETRY');

  return AssessmentItem.create({
    owner: ownerId,
    createdBy: ownerId,
    assessmentConfig: previous.assessmentConfig,
    concept: previous.concept,
    questionsOverride: wrongQuestionIds,
  });
}

// UC-ASM-12 (BR-15): an independent check reuses the concept's own active question pool rather than
// generating new ones live, so a student can prove mastery without AI assistance on demand.
// shortcut: pulls from the existing pool instead of asking AI for genuinely novel variants; upgrade:
// wire in aiAssistService.generateQuestion once bulk-generation + admin auto-approval exists.
async function startIndependentCheck(ownerId, conceptId) {
  let config = await AssessmentConfigItem.findOne({
    concept: conceptId,
    kind: 'independent_check',
    status: 'active',
  });
  const pool = await QuestionItem.find({ concept: conceptId, status: 'active' }).limit(10);
  if (pool.length === 0) throw ApiError.badRequest('No active questions for this concept yet', 'EMPTY_POOL');

  if (!config) {
    config = await AssessmentConfigItem.create({
      owner: ownerId,
      createdBy: ownerId,
      title: 'Independent check (auto)',
      concept: conceptId,
      kind: 'independent_check',
      questions: pool.map((q) => q._id),
      passScore: 50,
    });
  }

  const shuffled = [...pool].sort(() => Math.random() - 0.5).slice(0, Math.min(5, pool.length));
  return AssessmentItem.create({
    owner: ownerId,
    createdBy: ownerId,
    assessmentConfig: config._id,
    concept: conceptId,
    questionsOverride: shuffled.map((q) => q._id),
    independentCheck: true,
  });
}

// UC-AP-ASM-01 / UC-QBK-14: recomputes every submitted attempt that answered the given question,
// using the question's current content. Triggered only via an explicit admin confirm (UC-QBK-14),
// after a preview (UC-QBK-15).
async function regradeAffected(questionId, actorId) {
  const question = await QuestionItem.findById(questionId);
  if (!question) throw ApiError.notFound('Question not found');

  const affected = await AssessmentItem.find({ status: 'submitted', 'answers.question': questionId });
  const results = [];
  for (const attempt of affected) {
    const config = await AssessmentConfigItem.findById(attempt.assessmentConfig); // eslint-disable-line no-await-in-loop
    const allowedQuestionIds =
      attempt.questionsOverride.length > 0
        ? attempt.questionsOverride.map(String)
        : config.questions.map(String);
    const questions = await QuestionItem.find({ _id: { $in: allowedQuestionIds } }); // eslint-disable-line no-await-in-loop
    const questionById = new Map(questions.map((q) => [String(q._id), q]));

    const previousAnswers = attempt.answers.map((a) => ({
      question: a.question,
      selectedOptionIndex: a.selectedOptionIndex,
      essayText: a.essayText,
    }));
    // eslint-disable-next-line no-await-in-loop
    const { gradedAnswers, score } = await gradeAnswers(
      previousAnswers,
      questionById,
      actorId,
      attempt.concept,
    );
    const flagByQuestion = new Map(attempt.answers.map((a) => [String(a.question), a.flagged]));

    attempt.answers = gradedAnswers.map((a) => ({
      ...a,
      flagged: flagByQuestion.get(String(a.question)) ?? false,
    }));
    attempt.score = score;
    attempt.passed = score >= config.passScore;
    attempt.updatedBy = actorId;
    attempt.scoreHistory.push({ score, reason: 'regrade', changedBy: actorId });
    // eslint-disable-next-line no-await-in-loop
    await attempt.save();
    // eslint-disable-next-line no-await-in-loop
    await masteryService.upsertForAttempt(attempt.owner, attempt.concept, score, 'regrade');
    results.push({ assessment: attempt._id, newScore: score });
  }
  return { questionId, regradedCount: results.length, results };
}

// UC-QBK-15: how many submitted attempts would be touched by a regrade, without changing anything.
async function previewRegradeImpact(questionId) {
  const count = await AssessmentItem.countDocuments({ status: 'submitted', 'answers.question': questionId });
  return { questionId, affectedAttemptsCount: count };
}

module.exports = {
  start,
  listForOwner,
  getOwned,
  getOwnedRaw,
  getWrongAnswers,
  compareAttempts,
  getScoreHistory,
  setFlag,
  saveDraft,
  submit,
  startRetryWrong,
  startIndependentCheck,
  regradeAffected,
  previewRegradeImpact,
};
