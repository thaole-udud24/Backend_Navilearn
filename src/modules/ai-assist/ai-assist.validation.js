const { z } = require('zod');

const generateQuestionSchema = z.object({
  concept: z.string().min(1),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
});

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  kind: z
    .enum([
      'generate_question',
      'practice_question',
      'grade_essay',
      'qa',
      'explain_wrong',
      'essay_feedback',
      'generate_plan',
      'generate_concept',
      'generate_template',
    ])
    .optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

const generatePlanSchema = z.object({
  goalId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id'),
});

const generateConceptSchema = z.object({
  topic: z.string().min(1).max(200),
});

const generateTemplateSchema = z
  .object({
    topic: z.string().min(1).max(200).optional(),
    conceptId: z
      .string()
      .regex(/^[a-f\d]{24}$/i, 'Invalid id')
      .optional(),
    sessionCount: z.number().int().min(2).max(10).optional(),
  })
  .refine((o) => o.topic || o.conceptId, { message: 'Provide a topic or a concept' });

const askSchema = z.object({
  question: z.string().min(1).max(2000),
  concept: z.string().optional(),
});

const explainWrongSchema = z.object({
  assessmentItemId: z.string().min(1),
  question: z.string().min(1),
});

const essayFeedbackSchema = z.object({
  conceptId: z.string().optional(),
  questionText: z.string().min(1).max(1000),
  answerText: z.string().min(1).max(4000),
});

const rateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

const reportSchema = z.object({
  reason: z.string().min(1).max(1000),
});

module.exports = {
  generateQuestionSchema,
  listQuerySchema,
  idParamsSchema,
  askSchema,
  explainWrongSchema,
  essayFeedbackSchema,
  rateSchema,
  reportSchema,
  generatePlanSchema,
  generateConceptSchema,
  generateTemplateSchema,
};
