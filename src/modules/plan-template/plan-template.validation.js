const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const stepSchema = z.object({
  dayOffset: z.number().int().min(1).max(60),
  durationMin: z.number().int().min(5).max(480),
  note: z.string().trim().max(300).optional(),
  theoryContent: z.string().trim().max(8000).optional(),
  questions: z.array(objectId).max(20).optional(),
});

const createSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().trim().max(1000).optional(),
  concept: objectId.optional(),
  steps: z.array(stepSchema).min(1).max(20),
  isActive: z.boolean().optional(),
  source: z.enum(['manual', 'ai', 'import']).optional(),
});

const updateSchema = createSchema.partial().refine((o) => Object.keys(o).length > 0, 'No fields to update');

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
});

const idParamsSchema = z.object({ id: objectId });

const applySchema = z.object({
  goalId: objectId.optional(),
});

const importSchema = z.object({
  items: z.array(z.record(z.unknown())).min(1).max(500),
});

module.exports = { createSchema, updateSchema, listQuerySchema, idParamsSchema, applySchema, importSchema };
