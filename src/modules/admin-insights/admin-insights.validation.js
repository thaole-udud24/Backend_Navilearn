const { z } = require('zod');

const subjectQuerySchema = z.object({
  subjectId: z.string().optional(),
});

const volumeQuerySchema = z.object({
  days: z.string().optional(),
});

const topMissedQuerySchema = z.object({
  limit: z.string().optional(),
  concept: z.string().optional(),
});

const exportQuerySchema = z.object({
  report: z.enum(['learning-effectiveness', 'volume', 'top-missed']),
  subjectId: z.string().optional(),
  days: z.string().optional(),
  limit: z.string().optional(),
  concept: z.string().optional(),
});

module.exports = {
  subjectQuerySchema,
  volumeQuerySchema,
  topMissedQuerySchema,
  exportQuerySchema,
};
