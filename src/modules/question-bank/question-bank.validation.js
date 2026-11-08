const { z } = require('zod');

const optionSchema = z.object({
  text: z.string().min(1).max(300),
  isCorrect: z.boolean().optional(),
});

const createSchema = z
  .object({
    concept: z.string().min(1),
    type: z.enum(['mcq', 'essay']).optional(),
    text: z.string().min(1).max(1000),
    options: z.array(optionSchema).optional(),
    referenceAnswer: z.string().max(2000).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    points: z.number().int().min(1).max(100).optional(),
  })
  .refine(
    (data) => {
      if ((data.type ?? 'mcq') !== 'mcq') return true;
      const options = data.options ?? [];
      return options.length >= 2 && options.filter((o) => o.isCorrect).length === 1;
    },
    { message: 'MCQ questions require at least 2 options with exactly 1 correct answer', path: ['options'] },
  );

const updateStatusSchema = z.object({
  status: z.enum(['active', 'archived']),
});

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  concept: z.string().optional(),
  type: z.enum(['mcq', 'essay']).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  status: z.enum(['active', 'archived']).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

module.exports = { createSchema, updateStatusSchema, listQuerySchema, idParamsSchema };
