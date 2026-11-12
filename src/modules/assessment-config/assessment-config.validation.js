const { z } = require('zod');

const KINDS = ['placement', 'practice', 'chapter_test', 'mock_exam', 'independent_check'];

const createSchema = z.object({
  title: z.string().min(1).max(200),
  concept: z.string().min(1),
  questions: z.array(z.string().min(1)).min(1, 'An assessment needs at least 1 question'),
  passScore: z.number().int().min(0).max(100).optional(),
  timeLimitMinutes: z.number().int().min(0).optional(),
  kind: z.enum(KINDS).optional(),
});

const updateSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    questions: z.array(z.string().min(1)).min(1).optional(),
    passScore: z.number().int().min(0).max(100).optional(),
    timeLimitMinutes: z.number().int().min(0).optional(),
    kind: z.enum(KINDS).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

const updatePolicySchema = z.object({
  retryPolicy: z
    .object({
      maxAttempts: z.number().int().min(0).optional(),
      cooldownMinutes: z.number().int().min(0).optional(),
    })
    .optional(),
  showAnswersPolicy: z.enum(['after_submit', 'after_due', 'never']).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'archived']),
});

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  concept: z.string().optional(),
  kind: z.enum(KINDS).optional(),
  status: z.enum(['active', 'archived']).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

const criterionSchema = z.object({
  name: z.string().min(1).max(200),
  maxPoints: z.number().int().min(1).max(100),
  description: z.string().max(1000).optional(),
});

const createRubricSchema = z.object({
  title: z.string().min(1).max(200),
  concept: z.string().min(1),
  criteria: z.array(criterionSchema).min(1, 'A rubric needs at least 1 criterion'),
});

const updateRubricSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    criteria: z.array(criterionSchema).min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

const updateRubricStatusSchema = z.object({ status: z.enum(['active', 'archived']) });

const listRubricsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  concept: z.string().optional(),
  status: z.enum(['active', 'archived']).optional(),
});

module.exports = {
  createSchema,
  updateSchema,
  updatePolicySchema,
  updateStatusSchema,
  listQuerySchema,
  idParamsSchema,
  createRubricSchema,
  updateRubricSchema,
  updateRubricStatusSchema,
  listRubricsQuerySchema,
};
