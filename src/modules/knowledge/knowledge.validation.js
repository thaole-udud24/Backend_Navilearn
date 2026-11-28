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
  // 'null' = top-level concepts only (no parent); any other value = direct children of that id.
  parentConcept: z.string().min(1).optional(),
  // UC-KNW-05: case-insensitive search on the concept name.
  q: z.string().trim().min(1).max(100).optional(),
});

const idParamsSchema = z.object({ id: z.string().min(1) });

const importSchema = z.object({
  items: z.array(z.record(z.unknown())).min(1).max(500),
});

// ---------- admin: sample structures (UC-KNW-17, 19, 22) ----------
const copyStructureSchema = z.object({ name: z.string().trim().min(1).max(200).optional() });

// ---------- student: personal structure ----------
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID không hợp lệ');
const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

const subjectParamsSchema = z.object({ subjectId: objectId });
const nodeParamsSchema = z.object({ id: objectId });

const nodeFields = {
  name: z.string().trim().min(1, 'Tên không được để trống').max(200),
  description: z.string().trim().max(2000).optional(),
  parentNode: objectId.nullable().optional(),
  prerequisites: z.array(objectId).max(20).optional(),
  examFocus: z.boolean().optional(),
  order: z.number().int().min(0).max(100000).optional(),
};
const createNodeSchema = z.object(nodeFields);
const updateNodeSchema = z
  .object({ ...nodeFields, name: nodeFields.name.optional() })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Không có thay đổi nào');

const treeQuerySchema = z.object({ includeArchived: boolQuery.optional(), examFocus: boolQuery.optional() });
const searchQuerySchema = z.object({
  q: z.string().trim().min(1, 'Nhập từ khóa').max(100),
  includeArchived: boolQuery.optional(),
});
const applyTemplateSchema = z.object({ conceptId: objectId.optional() });

const noteListQuerySchema = z.object({ personalConcept: objectId });
const createNoteSchema = z.object({ personalConcept: objectId, content: z.string().trim().min(1, 'Nội dung ghi chú trống').max(5000) });
const updateNoteSchema = z.object({ content: z.string().trim().min(1, 'Nội dung ghi chú trống').max(5000) });

const proposalListQuerySchema = z.object({ status: z.enum(['pending', 'confirmed', 'rejected']).optional() });
const generateProposalSchema = z.object({ hint: z.string().trim().max(300).optional() });

module.exports = {
  copyStructureSchema,
  subjectParamsSchema,
  nodeParamsSchema,
  createNodeSchema,
  updateNodeSchema,
  treeQuerySchema,
  searchQuerySchema,
  applyTemplateSchema,
  noteListQuerySchema,
  createNoteSchema,
  updateNoteSchema,
  proposalListQuerySchema,
  generateProposalSchema,
  createSchema,
  updateSchema,
  updateStatusSchema,
  listQuerySchema,
  idParamsSchema,
  importSchema,
};
