const { z } = require('zod');

const createSchema = z.object({
  title: z.string().min(1).max(200),
  concept: z.string().min(1),
  questions: z.array(z.string().min(1)).min(1, 'An assessment needs at least 1 question'),
  passScore: z.number().int().min(0).max(100).optional(),
  timeLimitMinutes: z.number().int().min(0).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'archived']),
});

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  concept: z.string().optional(),
  status: z.enum(['active', 'archived']).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

module.exports = { createSchema, updateStatusSchema, listQuerySchema, idParamsSchema };
