const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const createSchema = z.object({
  title: z.string().trim().min(1).max(150),
  concept: objectId,
  objectives: z.array(z.string().trim().max(200)).max(6).optional(),
  theoryContent: z.string().trim().max(8000).optional(),
  questions: z.array(objectId).max(50).optional(),
  estimatedMinutes: z.number().int().min(5).max(480).optional(),
  source: z.enum(['manual', 'ai', 'import']).optional(),
});

const updateSchema = createSchema.partial().refine((o) => Object.keys(o).length > 0, 'No fields to update');

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  concept: objectId.optional(),
  status: z.enum(['draft', 'published', 'archived']).optional(),
});

const idParamsSchema = z.object({ id: objectId });

module.exports = { createSchema, updateSchema, listQuerySchema, idParamsSchema };
