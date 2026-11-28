const ApiError = require('../../utils/ApiError');
const AssessmentItem = require('../assessment/assessment.model');
const AssessmentConfigItem = require('../assessment-config/assessment-config.model');

// Mức hỗ trợ do server quyết định, không nhận mức do client tự khai.
const HELP_LEVEL = {
  practice_question: 1,
  qa: 2,
  essay_feedback: 3,
};

async function assertActiveAttempt(ownerId, assessmentItemId, conceptId) {
  if (!assessmentItemId) return;

  const attempt = await AssessmentItem.findOne({
    _id: assessmentItemId,
    owner: ownerId,
    status: 'in_progress',
  }).select('concept independentCheck assessmentConfig');

  if (!attempt || !conceptId || String(attempt.concept) !== String(conceptId)) {
    throw ApiError.badRequest('Bài làm đang diễn ra không thuộc kiến thức này', 'INVALID_AI_HELP_ATTEMPT');
  }

  if (attempt.independentCheck) {
    throw ApiError.forbidden('Không được dùng AI trong bài kiểm chứng độc lập');
  }

  const config = await AssessmentConfigItem.findById(attempt.assessmentConfig).select('kind');

  if (!config || ['placement', 'independent_check'].includes(config.kind)) {
    throw ApiError.forbidden('Không được dùng AI trong loại bài kiểm tra này');
  }
}

async function recordHelp(ownerId, assessmentItemId, conceptId, kind) {
  if (!assessmentItemId) return;

  const level = HELP_LEVEL[kind];
  if (!level) throw ApiError.badRequest('Loại hỗ trợ AI không hợp lệ', 'INVALID_AI_HELP_KIND');

  const result = await AssessmentItem.updateOne(
    {
      _id: assessmentItemId,
      owner: ownerId,
      concept: conceptId,
      status: 'in_progress',
      independentCheck: { $ne: true }, // không cho phép dùng AI trong bài kiểm chứng độc lập
    },
    {
      $max: { aiHelpLevel: level },
      $inc: { aiHelpCount: 1 },
    },
  );

  if (result.matchedCount !== 1) {
    throw ApiError.conflict('Bài làm đã kết thúc hoặc không còn hợp lệ', 'AI_HELP_ATTEMPT_CLOSED');
  }
}

async function getAiHelpRatio(ownerId, conceptId) {
  const filter = {
    owner: ownerId,
    status: 'submitted',
    independentCheck: { $ne: true },
    ...(conceptId ? { concept: conceptId } : {}),
  };

  const [totalAttempts, assistedAttempts] = await Promise.all([
    AssessmentItem.countDocuments(filter),
    AssessmentItem.countDocuments({
      ...filter,
      aiHelpLevel: { $gt: 0 },
    }),
  ]);

  return {
    totalAttempts,
    assistedAttempts,
    aiHelpRatio: totalAttempts === 0 ? 0 : Number((assistedAttempts / totalAttempts).toFixed(4)),
  };
}

module.exports = {
  assertActiveAttempt,
  recordHelp,
  getAiHelpRatio,
};
