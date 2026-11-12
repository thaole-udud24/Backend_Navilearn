const { z } = require('zod');

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  order: z.number().int().optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'archived']),
});

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(['active', 'archived']).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

module.exports = { createSchema, updateStatusSchema, listQuerySchema, idParamsSchema };
