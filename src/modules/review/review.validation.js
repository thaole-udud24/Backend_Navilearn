const { z } = require('zod');

const CATEGORIES = ['lo_trinh', 'luyen_tap', 'noi_dung', 'he_thong', 'khac'];

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(2000),
  rating: z.number().int().min(1).max(5),
  category: z.enum(CATEGORIES).default('khac'),
});

const updateStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved']),
});

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'resolved']).optional(),
  category: z.enum(CATEGORIES).optional(),
  rating: z.string().optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

module.exports = { createSchema, updateStatusSchema, listQuerySchema, idParamsSchema };
