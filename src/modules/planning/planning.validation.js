const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const sessionSchema = z.object({
  concept: objectId,
  startAt: z.coerce.date(),
  durationMin: z.number().int().min(5).max(480),
  title: z.string().trim().min(1).max(150),
  chapterTitle: z.string().trim().max(150).optional(),
  objectives: z.array(z.string().trim().max(200)).max(6).optional(),
  theoryContent: z.string().trim().max(8000).optional(),
  questions: z.array(objectId).max(20).optional(),
  lessonId: objectId.nullable().optional(),
});

const updateSessionSchema = sessionSchema
  .partial()
  .extend({
    status: z.enum(['done', 'cancelled']).optional(), // 'missed' is set by the system (AP-PLN-01)
    note: z.string().trim().min(1).max(1000).optional(),
    bookmarked: z.boolean().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'No fields to update');

const createSchema = z.object({
  title: z.string().min(1).max(200),
  // Fix: Plan↔Goal link (manual "Tự thiết kế" create) — optional, ownership verified in the service.
  goalId: objectId.optional(),
  sessions: z.array(sessionSchema).max(100).default([]),
});
// Shared across goal schemas (Phase C, 4-step wizard).
const examFieldsShape = {
  examName: z.string().trim().max(150).optional(),
  startDate: z.coerce.date().optional(),
  studyDays: z.number().int().min(1).max(180).optional(),
  minutesPerDay: z.number().int().min(10).max(480).optional(),
  restDays: z.array(z.number().int().min(0).max(6)).optional(),
  documentIds: z.array(objectId).max(30).optional(),
  assetIds: z.array(objectId).max(30).optional(),
  examScope: z.string().trim().max(2000).optional(),
  examFormat: z.string().trim().max(100).optional(),
  selfReportedScore: z.number().min(0).max(10).optional(),
};

const goalSchema = z.object({
  concept: objectId,
  title: z.string().min(1).max(200),
  deadline: z.coerce.date().refine((d) => d > new Date(), 'Deadline must be in the future'),
  importance: z.number().int().min(1).max(5).optional(),
  targetScore: z.number().min(0).max(10).optional(),
  ...examFieldsShape,
});

const updateGoalSchema = goalSchema.partial().refine((o) => Object.keys(o).length > 0, 'No fields to update');

// Draft save: any wizard step, any subset of fields filled so far. Deadline not required yet
// (and not restricted to the future, since a draft may be saved before the exam date is chosen).
const draftGoalSchema = z.object({
  wizardStep: z.number().int().min(1).max(4).optional(),
  concept: objectId.optional(),
  title: z.string().trim().max(200).optional(),
  deadline: z.coerce.date().optional(),
  importance: z.number().int().min(1).max(5).optional(),
  targetScore: z.number().min(0).max(10).optional(),
  ...examFieldsShape,
});

// Activate: the wizard's "5 required questions" (concept, examName, targetScore, studyDays, minutesPerDay),
// plus title/deadline which the wizard derives from them.
const activateGoalSchema = z.object({
  concept: objectId,
  title: z.string().trim().min(1).max(200),
  deadline: z.coerce.date(),
  examName: z.string().trim().min(1).max(150),
  targetScore: z.number().min(0).max(10),
  // Optional at the schema level: when startDate is also sent, the service re-derives studyDays
  // from startDate/deadline/restDays and ignores whatever's sent here (see applyDerivedStudyDays).
  // Required only for the legacy no-startDate path — enforced by ACTIVATE_REQUIRED_FIELDS in the
  // service after derivation, not here, so a startDate-driven activate isn't blocked by this schema.
  studyDays: z.number().int().min(1).max(180).optional(),
  minutesPerDay: z.number().int().min(10).max(480),
  importance: z.number().int().min(1).max(5).optional(),
  startDate: z.coerce.date().optional(),
  restDays: z.array(z.number().int().min(0).max(6)).optional(),
  documentIds: z.array(objectId).max(30).optional(),
  assetIds: z.array(objectId).max(30).optional(),
  examScope: z.string().trim().max(2000).optional(),
  examFormat: z.string().trim().max(100).optional(),
  selfReportedScore: z.number().min(0).max(10).optional(),
});

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(['proposed', 'active', 'superseded']).optional(),
  // Plans: matches any session's concept. Goals: matches the goal's own concept.
  concept: objectId.optional(),
  subjectId: objectId.optional(),
});

// UC-PLN-01/02: calendar window (from inclusive, to exclusive) and/or history by status.
const sessionsQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    status: z.enum(['planned', 'done', 'missed', 'cancelled']).optional(),
    subjectId: objectId.optional(),
  })
  .refine((q) => !q.from || !q.to || q.from < q.to, 'from must be before to');

// "Kế hoạch ngày": single day, or a from/to range for a lightweight calendar view.
const dailyQuerySchema = z.object({ date: z.coerce.date().optional(), subjectId: objectId.optional() });
const dailyRangeQuerySchema = z
  .object({ from: z.coerce.date(), to: z.coerce.date(), subjectId: objectId.optional() })
  .refine((q) => q.from < q.to, 'from must be before to');

const idParamsSchema = z.object({ id: objectId });

const sessionParamsSchema = z.object({ id: objectId, sessionId: objectId });

const submitQuizSchema = z.object({
  answers: z
    .array(z.object({ questionId: objectId, selectedOptionIndex: z.number().int().min(0).max(9) }))
    .min(1)
    .max(20),
});

const pauseGoalSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

const closeGoalSchema = z.object({
  examResultScore: z.number().min(0).max(10).optional(),
  closingNote: z.string().trim().max(1000).optional(),
});

module.exports = {
  createSchema,
  sessionSchema,
  updateSessionSchema,
  goalSchema,
  updateGoalSchema,
  draftGoalSchema,
  activateGoalSchema,
  pauseGoalSchema,
  closeGoalSchema,
  listQuerySchema,
  sessionsQuerySchema,
  dailyQuerySchema,
  dailyRangeQuerySchema,
  idParamsSchema,
  sessionParamsSchema,
  submitQuizSchema,
};
