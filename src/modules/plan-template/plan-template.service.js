const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const importBulk = require('../../utils/importBulk');
const PlanTemplateItem = require('./plan-template.model');
const Concept = require('../knowledge/knowledge.model');
const knowledgeService = require('../knowledge/knowledge.service');
const QuestionItem = require('../question-bank/question-bank.model');
const LessonItem = require('../lesson/lesson.model');
const User = require('../account/account.auth.model');
const planningService = require('../planning/planning.service');
const { createSchema } = require('./plan-template.validation');
const { resolveSubjectConceptIds } = require('../../shared/subjectFilter');

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
  if (conceptId) {
    // Real questions are tagged at the leaf Concept level, never at a root "môn học" — so a
    // template scoped to a whole subject must accept any question under that subject's subtree,
    // not just ones tagged with the exact same id (that exact-match used to force every real
    // subject-level template to be saved with concept: null just to get past this check).
    const allowedIds = new Set((await knowledgeService.getDescendantIds(conceptId)).map(String));
    if (questions.some((q) => !allowedIds.has(String(q.concept)))) {
      throw ApiError.badRequest(
        'Tất cả câu hỏi trong lộ trình phải thuộc đúng kiến thức của lộ trình mẫu',
        'QUESTION_CONCEPT_MISMATCH',
      );
    }
  }
}

// A step may optionally point at a Thư viện bài học lesson instead of being authored by hand. The
// lesson is only ever a reference for traceability/"sync lại" — objectives/theoryContent/questions
// are snapshotted from it into the step right here, at save time, so a template behaves exactly
// like before everywhere else (apply(), student roadmap) even if the lesson changes later. Mirrors
// the status-gating other modules use for similar refs (e.g. assessment-config's questions must be
// published before being added).
async function applyLessonSnapshots(steps) {
  const lessonIds = [...new Set((steps ?? []).map((s) => s.lessonId).filter(Boolean).map(String))];
  if (lessonIds.length === 0) return;
  const lessons = await LessonItem.find({ _id: { $in: lessonIds } });
  const lessonById = new Map(lessons.map((l) => [String(l._id), l]));
  steps.forEach((step) => {
    if (!step.lessonId) return;
    const lesson = lessonById.get(String(step.lessonId));
    if (!lesson) throw ApiError.badRequest('Lesson not found', 'LESSON_NOT_FOUND');
    if (lesson.status !== 'published') {
      throw ApiError.badRequest(
        'Chỉ được chọn bài học đã xuất bản từ thư viện',
        'LESSON_NOT_PUBLISHED',
      );
    }
    step.objectives = lesson.objectives;
    step.theoryContent = lesson.theoryContent;
    step.questions = lesson.questions;
  });
}

// Student sees only published templates; admin manages the full catalog (UC-PLN-TPL-01/02).
async function listForRequester(requester, query) {
  const { page, limit, skip } = parsePagination(query);
  const subjectIds = await resolveSubjectConceptIds(query.subjectId, requester);
  const filter =
    requester.role === 'admin' ? (query.status ? { status: query.status } : {}) : { status: 'published' };
  if (query.concept && subjectIds) {
    filter.concept = subjectIds.some((id) => String(id) === String(query.concept)) ? query.concept : null;
  } else if (query.concept) {
    filter.concept = query.concept;
  } else if (subjectIds) {
    filter.concept = { $in: subjectIds };
  }
  const [items, total] = await Promise.all([
    PlanTemplateItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('concept', 'name'),
    PlanTemplateItem.countDocuments(filter),
  ]);
  // "Người biên soạn" shown on the Bản đồ lộ trình view — createdBy/updatedBy are plain string
  // user ids (not a Mongoose ref), so this is a manual join instead of .populate().
  const authorIds = [...new Set(items.map((i) => i.updatedBy || i.createdBy).filter(Boolean))];
  const authors = authorIds.length ? await User.find({ _id: { $in: authorIds } }, 'fullName') : [];
  const nameById = new Map(authors.map((u) => [String(u._id), u.fullName]));
  const withAuthor = items.map((i) => {
    const plain = i.toObject ? i.toObject() : i;
    return { ...plain, authorName: nameById.get(plain.updatedBy || plain.createdBy) ?? null };
  });
  return { items: withAuthor, meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const item = await PlanTemplateItem.findById(id).populate('concept', 'name');
  if (!item) throw ApiError.notFound('Plan template not found');
  return item;
}

async function create(requesterId, data) {
  await assertConceptExists(data.concept);
  await applyLessonSnapshots(data.steps);
  await assertStepQuestionsValid(data.concept, data.steps);
  return PlanTemplateItem.create({ ...data, createdBy: requesterId });
}

async function update(id, requesterId, data) {
  await assertConceptExists(data.concept);
  const item = await getById(id);
  if (data.steps) {
    await applyLessonSnapshots(data.steps);
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

// Draft -> published (or re-published after editing): no immutable per-version history — editing a
// published template and publishing again just bumps `version` on the same record (see model).
async function publish(id, requesterId, changeLog) {
  const item = await getById(id);
  if (item.status === 'published') item.version += 1;
  item.status = 'published';
  item.publishedAt = new Date();
  item.changeLog = changeLog ?? '';
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

// Hides a template from the catalog (student can no longer apply it) without deleting it — students
// already using it keep their existing path_instance untouched (plan-template.apply() only copies
// steps into the student's own Plan at apply time, so this has no effect on plans already created).
async function archive(id, requesterId) {
  const item = await getById(id);
  item.status = 'archived';
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

// UC-PLN-TPL-02: student picks a ready-made roadmap instead of building one by hand or asking the
// AI (UC-PLN-AI-01) — same destination either way: a 'proposed' Plan the student still confirms.
async function apply(ownerId, templateId, goalId) {
  const template = await getById(templateId);
  if (template.status !== 'published') throw ApiError.conflict('This template is no longer available');

  let fallbackConcept = template.concept?._id ?? template.concept;
  if (goalId) {
    const goal = await planningService.getOwnedGoal(goalId, { id: ownerId });
    fallbackConcept = goal.concept;
  }
  if (!fallbackConcept)
    throw ApiError.badRequest(
      'No concept to apply this template to — pick a goal or a concept-specific template',
      'NO_CONCEPT',
    );

  // Real leaf concept per session: a step linked to a Thư viện bài học lesson inherits THAT lesson's
  // own leaf Concept (set by the Admin when authoring it) instead of the template's root subject —
  // only steps with no `lessonId` (ad-hoc/manual content) keep the root concept, since there's no
  // reliable leaf concept for those (plan-template.model's stepSchema/concept comment).
  const lessonIds = [...new Set(template.steps.map((s) => s.lessonId).filter(Boolean).map(String))];
  const lessons = lessonIds.length ? await LessonItem.find({ _id: { $in: lessonIds } }) : [];
  const conceptByLessonId = new Map(lessons.map((l) => [String(l._id), l.concept]));

  const sessions = template.steps.map(
    ({ dayOffset, durationMin, title, chapterTitle, note, objectives, theoryContent, questions, lessonId }) => {
      const startAt = new Date();
      startAt.setDate(startAt.getDate() + dayOffset);
      startAt.setHours(19, 0, 0, 0);
      const concept = (lessonId && conceptByLessonId.get(String(lessonId))) || fallbackConcept;
      return {
        concept,
        startAt,
        durationMin,
        title,
        chapterTitle,
        note,
        objectives,
        theoryContent,
        questions,
        lessonId: lessonId ?? null,
      };
    },
  );

  return planningService.create(ownerId, {
    title: `${template.title} (từ lộ trình mẫu)`,
    status: 'proposed',
    goal: goalId ?? null,
    sessions,
  });
}

// Re-copies the current published lesson content into an already-linked step — useful once the
// library lesson is edited after a template step snapshotted it (UC: "Đồng bộ lại" in the builder).
async function syncStepFromLesson(id, stepIndex, requesterId) {
  const item = await getById(id);
  const step = item.steps[stepIndex];
  if (!step) throw ApiError.notFound('Step not found');
  if (!step.lessonId) throw ApiError.badRequest('Buổi học này chưa liên kết bài học nào', 'STEP_NO_LESSON');
  const lesson = await LessonItem.findById(step.lessonId);
  if (!lesson) throw ApiError.badRequest('Lesson not found', 'LESSON_NOT_FOUND');
  if (lesson.status !== 'published') {
    throw ApiError.badRequest('Chỉ được đồng bộ từ bài học đã xuất bản', 'LESSON_NOT_PUBLISHED');
  }
  step.objectives = lesson.objectives;
  step.theoryContent = lesson.theoryContent;
  step.questions = lesson.questions;
  item.updatedBy = requesterId;
  await item.save();
  return item;
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
  publish,
  archive,
  apply,
  syncStepFromLesson,
  importBulk: importBulkTemplates,
  exportAll,
};
