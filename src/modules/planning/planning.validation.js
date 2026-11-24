const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const sessionSchema = z.object({
  concept: objectId,
  startAt: z.coerce.date(),
  durationMin: z.number().int().min(5).max(480),
  theoryContent: z.string().trim().max(8000).optional(),
  questions: z.array(objectId).max(20).optional(),
});

const updateSessionSchema = sessionSchema
  .partial()
  .extend({
    status: z.enum(['done', 'cancelled']).optional(), // 'missed' is set by the system (AP-PLN-01)
    note: z.string().trim().min(1).max(1000).optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'No fields to update');

const createSchema = z.object({
  title: z.string().min(1).max(200),
  sessions: z.array(sessionSchema).max(100).default([]),
});
const goalSchema = z.object({
  concept: objectId,
  title: z.string().min(1).max(200),
  deadline: z.coerce.date().refine((d) => d > new Date(), 'Deadline must be in the future'),
  importance: z.number().int().min(1).max(5).optional(),
});

const updateGoalSchema = goalSchema.partial().refine((o) => Object.keys(o).length > 0, 'No fields to update');

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(['proposed', 'active', 'superseded']).optional(),
});

// UC-PLN-01/02: calendar window (from inclusive, to exclusive) and/or history by status.
const sessionsQuerySchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    status: z.enum(['planned', 'done', 'missed', 'cancelled']).optional(),
  })
  .refine((q) => !q.from || !q.to || q.from < q.to, 'from must be before to');

const idParamsSchema = z.object({ id: objectId });

const sessionParamsSchema = z.object({ id: objectId, sessionId: objectId });

const submitQuizSchema = z.object({
  answers: z
    .array(z.object({ questionId: objectId, selectedOptionIndex: z.number().int().min(0).max(9) }))
    .min(1)
    .max(20),
});

module.exports = {
  createSchema,
  sessionSchema,
  updateSessionSchema,
  goalSchema,
  updateGoalSchema,
  listQuerySchema,
  sessionsQuerySchema,
  idParamsSchema,
  sessionParamsSchema,
  submitQuizSchema,
};
