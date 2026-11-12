const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const sessionSchema = z.object({
  concept: objectId,
  startAt: z.coerce.date(),
  durationMin: z.number().int().min(5).max(480),
});

const updateSessionSchema = sessionSchema
  .partial()
  .extend({ status: z.enum(['planned', 'done', 'missed']).optional() })
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

const idParamsSchema = z.object({ id: objectId });

const sessionParamsSchema = z.object({ id: objectId, sessionId: objectId });
module.exports = {
  createSchema,
  sessionSchema,
  updateSessionSchema,
  goalSchema,
  updateGoalSchema,
  listQuerySchema,
  idParamsSchema,
  sessionParamsSchema,
};
