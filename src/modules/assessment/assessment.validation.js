const { z } = require('zod');

const startSchema = z.object({
  assessmentConfig: z.string().min(1),
});

const submitSchema = z.object({
  answers: z
    .array(
      z.object({
        question: z.string().min(1),
        selectedOptionIndex: z.number().int().min(0).optional(),
        essayText: z.string().max(4000).optional(),
      }),
    )
    .min(1),
});

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(['in_progress', 'submitted']).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

module.exports = { startSchema, submitSchema, listQuerySchema, idParamsSchema };
