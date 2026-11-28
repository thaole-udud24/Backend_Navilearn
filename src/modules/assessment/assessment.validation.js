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
  subjectId: z.string().optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

const compareQuerySchema = z.object({ concept: z.string().min(1) });

const retryWrongSchema = z.object({ previousAttemptId: z.string().min(1) });

const independentCheckSchema = z.object({ concept: z.string().min(1) });

const placementCheckSchema = z.object({ concept: z.string().min(1) });

// N2: concept-only keeps retrying every open item for a concept (back-compat); wrongItemIds scopes
// the attempt to just the rows the student checked in the Sổ câu sai table (see assessment.service).
const retryWrongItemsSchema = z
  .object({
    concept: z.string().min(1).optional(),
    wrongItemIds: z.array(z.string().min(1)).min(1).optional(),
  })
  .refine((d) => !!d.concept || (d.wrongItemIds && d.wrongItemIds.length > 0), {
    message: 'concept or wrongItemIds is required',
  });

const quickQuizSchema = z.object({
  concept: z.string().min(1).optional(),
  count: z.number().int().min(3).max(15).optional(),
});

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
  placementCheckSchema,
  retryWrongItemsSchema,
  quickQuizSchema,
};
