const { z } = require('zod');

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(2000),
  issueType: z.enum(['question_error', 'display_bug', 'system_error', 'other']).optional(),
  location: z.string().max(300).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved']),
});

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'resolved']).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

// B10: admin reply sent back to the reporting student.
const respondSchema = z.object({ message: z.string().min(1).max(2000) });

module.exports = { createSchema, updateStatusSchema, listQuerySchema, idParamsSchema, respondSchema };
