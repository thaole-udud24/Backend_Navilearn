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

const updateSchema = z
  .object({
    concept: z.string().min(1).optional(),
    type: z.enum(['mcq', 'essay']).optional(),
    text: z.string().min(1).max(1000).optional(),
    options: z.array(optionSchema).optional(),
    referenceAnswer: z.string().max(2000).optional(),
    difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
    points: z.number().int().min(1).max(100).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: 'Provide at least one field to update' });

const importSchema = z.object({
  items: z.array(z.record(z.unknown())).min(1).max(500),
});

const exportQuerySchema = z.object({
  concept: z.string().optional(),
  status: z.enum(['active', 'archived']).optional(),
});

const fromAiDraftSchema = z.object({
  aiAssistLogId: z.string().min(1),
  concept: z.string().optional(),
  text: z.string().min(1).max(1000).optional(),
  options: z.array(optionSchema).min(2).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']).optional(),
  points: z.number().int().min(1).max(100).optional(),
});

const reportIssueSchema = z.object({
  reason: z.enum(['wrong_answer', 'unclear', 'typo', 'duplicate', 'other']),
  description: z.string().max(1000).optional(),
});

const issueReportListQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(['open', 'resolved', 'dismissed']).optional(),
});

const resolveIssueReportSchema = z.object({
  action: z.enum(['fix', 'dismiss']),
  resolution: z.string().max(1000).optional(),
});

const qualityStatsQuerySchema = z.object({ concept: z.string().optional() });

const duplicatesQuerySchema = z.object({ concept: z.string().optional() });

module.exports = {
  createSchema,
  updateSchema,
  updateStatusSchema,
  listQuerySchema,
  idParamsSchema,
  importSchema,
  exportQuerySchema,
  fromAiDraftSchema,
  reportIssueSchema,
  issueReportListQuerySchema,
  resolveIssueReportSchema,
  qualityStatsQuerySchema,
  duplicatesQuerySchema,
};
