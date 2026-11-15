const { z } = require('zod');

const startSchema = z.object({
  assessmentConfig: z.string().min(1),
});

const answerSchema = z.object({
  question: z.string().min(1),
  selectedOptionIndex: z.number().int().min(0).optional(),
  essayText: z.string().max(4000).optional(),
});

const submitSchema = z.object({
  answers: z.array(answerSchema).min(1),
});

const draftSchema = z.object({
  answers: z.array(answerSchema).min(1),
});

const flagSchema = z.object({
  question: z.string().min(1),
  flagged: z.boolean(),
});

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(['in_progress', 'submitted']).optional(),
  concept: z.string().optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

const compareQuerySchema = z.object({ concept: z.string().min(1) });

const retryWrongSchema = z.object({ previousAttemptId: z.string().min(1) });

const independentCheckSchema = z.object({ concept: z.string().min(1) });

module.exports = {
  startSchema,
  submitSchema,
  draftSchema,
  flagSchema,
  listQuerySchema,
  idParamsSchema,
  compareQuerySchema,
  retryWrongSchema,
  independentCheckSchema,
};
