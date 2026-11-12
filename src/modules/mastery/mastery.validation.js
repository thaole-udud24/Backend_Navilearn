const { z } = require('zod');

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  concept: z.string().optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

const trendQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

const setGoalSchema = z.object({ goalScore: z.number().min(0).max(100) });

const markContentCompleteSchema = z.object({
  concept: z.string().min(1),
  contentRef: z.string().min(1).max(200),
});

const exportQuerySchema = z.object({
  concept: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});

module.exports = {
  listQuerySchema,
  idParamsSchema,
  trendQuerySchema,
  setGoalSchema,
  markContentCompleteSchema,
  exportQuerySchema,
};
