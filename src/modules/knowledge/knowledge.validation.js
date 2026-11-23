const { z } = require('zod');

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  order: z.number().int().optional(),
  // Provenance only (display, not access control) — 'ai'/'import' are set by the server-side flows
  // that produce them (generateConceptDraft approval, bulk import), not meant for free client input,
  // but accepting it here keeps create()/importBulk() a single code path.
  source: z.enum(['manual', 'ai', 'import']).optional(),
  parentConcept: z.string().min(1).nullable().optional(),
  prerequisites: z.array(z.string().min(1)).max(20).optional(),
  related: z.array(z.string().min(1)).max(20).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['active', 'archived']),
});

const updateSchema = createSchema.partial().refine((o) => Object.keys(o).length > 0, 'No fields to update');

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(['active', 'archived']).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

const importSchema = z.object({
  items: z.array(z.record(z.unknown())).min(1).max(500),
});

module.exports = {
  createSchema,
  updateSchema,
  updateStatusSchema,
  listQuerySchema,
  idParamsSchema,
  importSchema,
};
