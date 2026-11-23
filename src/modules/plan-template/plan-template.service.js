const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const importBulk = require('../../utils/importBulk');
const PlanTemplateItem = require('./plan-template.model');
const Concept = require('../knowledge/knowledge.model');
const QuestionItem = require('../question-bank/question-bank.model');
const planningService = require('../planning/planning.service');
const { createSchema } = require('./plan-template.validation');

async function assertConceptExists(conceptId) {
  if (!conceptId) return;
  const exists = await Concept.exists({ _id: conceptId });
  if (!exists) throw ApiError.badRequest('Concept not found', 'CONCEPT_NOT_FOUND');
}

// A template's steps reuse questions from the shared Ngân hàng câu hỏi rather than embedding their
// own copy (same reuse pattern as assessment-config's assertQuestionsBelongToConcept) — so a bad
// question id here would otherwise only surface later, silently, when a student applies the
// template and plan-template.apply() copies it straight into their real study Plan.
async function assertStepQuestionsValid(conceptId, steps) {
  const questionIds = [...new Set((steps ?? []).flatMap((s) => s.questions ?? []))];
  if (questionIds.length === 0) return;
  const questions = await QuestionItem.find({ _id: { $in: questionIds } });
  if (questions.length !== questionIds.length) {
    throw ApiError.badRequest('Một số câu hỏi trong lộ trình không tồn tại', 'QUESTION_NOT_FOUND');
  }
  if (conceptId && questions.some((q) => String(q.concept) !== String(conceptId))) {
    throw ApiError.badRequest(
      'Tất cả câu hỏi trong lộ trình phải thuộc đúng kiến thức của lộ trình mẫu',
      'QUESTION_CONCEPT_MISMATCH',
    );
  }
}

// Student sees only published templates; admin manages the full catalog (UC-PLN-TPL-01/02).
async function listForRequester(requester, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = requester.role === 'admin' ? {} : { isActive: true };
  const [items, total] = await Promise.all([
    PlanTemplateItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('concept', 'name'),
    PlanTemplateItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const item = await PlanTemplateItem.findById(id).populate('concept', 'name');
  if (!item) throw ApiError.notFound('Plan template not found');
  return item;
}

async function create(requesterId, data) {
  await assertConceptExists(data.concept);
  await assertStepQuestionsValid(data.concept, data.steps);
  return PlanTemplateItem.create({ ...data, createdBy: requesterId });
}

async function update(id, requesterId, data) {
  await assertConceptExists(data.concept);
  const item = await getById(id);
  if (data.steps) {
    const effectiveConcept = data.concept !== undefined ? data.concept : (item.concept?._id ?? item.concept);
    await assertStepQuestionsValid(effectiveConcept, data.steps);
  }
  Object.assign(item, data, { updatedBy: requesterId });
  await item.save();
  return item;
}

async function remove(id, requesterId) {
  const item = await getById(id);
  item.updatedBy = requesterId;
  await item.softDelete();
}

// UC-PLN-TPL-02: student picks a ready-made roadmap instead of building one by hand or asking the
// AI (UC-PLN-AI-01) — same destination either way: a 'proposed' Plan the student still confirms.
async function apply(ownerId, templateId, goalId) {
  const template = await getById(templateId);
  if (!template.isActive) throw ApiError.conflict('This template is no longer available');

  let concept = template.concept?._id ?? template.concept;
  if (goalId) {
    const goal = await planningService.getOwnedGoal(goalId, { id: ownerId });
    concept = goal.concept;
  }
  if (!concept)
    throw ApiError.badRequest(
      'No concept to apply this template to — pick a goal or a concept-specific template',
      'NO_CONCEPT',
    );

  const sessions = template.steps.map(({ dayOffset, durationMin, note, theoryContent, questions }) => {
    const startAt = new Date();
    startAt.setDate(startAt.getDate() + dayOffset);
    startAt.setHours(19, 0, 0, 0);
    return { concept, startAt, durationMin, note, theoryContent, questions };
  });

  return planningService.create(ownerId, {
    title: `${template.title} (từ lộ trình mẫu)`,
    status: 'proposed',
    sessions,
  });
}

async function importBulkTemplates(requesterId, rows) {
  return importBulk(rows, {
    schema: createSchema,
    create: (data) => create(requesterId, { ...data, source: 'import' }),
  });
}

async function exportAll() {
  return PlanTemplateItem.find({}).sort({ createdAt: -1 }).limit(1000).populate('concept', 'name');
}

module.exports = {
  listForRequester,
  getById,
  create,
  update,
  remove,
  apply,
  importBulk: importBulkTemplates,
  exportAll,
};
