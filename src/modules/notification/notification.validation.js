const { z } = require('zod');

const createSchema = z.object({
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(2000),
});

const updateStatusSchema = z.object({
  status: z.enum(['open', 'in_progress', 'resolved']),
});

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'resolved']).optional(),
  category: z.enum(['hoc_tap', 'he_thong']).optional(),
  read: z.enum(['true', 'false']).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

// B9: admin compose. audience.subjectId required only when type === 'subject', checked below
// (zod's discriminatedUnion would reject the flat {type,subjectId} shape the UI posts).
const audienceSchema = z
  .object({
    type: z.enum(['all', 'subject']),
    subjectId: z.string().optional(),
  })
  .refine((a) => a.type === 'all' || !!a.subjectId, {
    message: 'subjectId is required when audience.type is "subject"',
    path: ['subjectId'],
  });

const broadcastSchema = z.object({
  audience: audienceSchema,
  category: z.enum(['hoc_tap', 'he_thong']),
  title: z.string().min(1).max(200),
  content: z.string().min(1).max(2000),
  link: z.string().max(500).optional(),
});

module.exports = { createSchema, updateStatusSchema, listQuerySchema, idParamsSchema, broadcastSchema };
