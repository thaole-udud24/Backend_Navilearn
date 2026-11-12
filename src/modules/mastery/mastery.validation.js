const { z } = require('zod');

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  concept: z.string().optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

module.exports = { listQuerySchema, idParamsSchema };
