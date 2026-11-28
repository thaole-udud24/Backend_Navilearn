const { z } = require('zod');

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  subject: z.string().optional(),
  subjectId: z.string().optional(),
  concept: z.string().optional(),
  status: z.enum(['open', 'mastered']).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

const retryQuerySchema = z.object({
  concept: z.string().optional(),
  limit: z.string().optional(),
});

module.exports = { listQuerySchema, idParamsSchema, retryQuerySchema };
