const { z } = require('zod');

const generateQuestionSchema = z.object({
  concept: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

module.exports = { generateQuestionSchema, listQuerySchema, idParamsSchema };
