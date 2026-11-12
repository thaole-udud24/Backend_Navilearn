const { z } = require('zod');

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(2000),
});

const updateStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved']),
});

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'resolved']).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

module.exports = { createSchema, updateStatusSchema, listQuerySchema, idParamsSchema };
