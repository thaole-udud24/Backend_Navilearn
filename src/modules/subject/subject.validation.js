const { z } = require('zod');
const { SUBJECT_STATUS, PROCESSING_STATUS } = require('./subject.constants');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'ID không hợp lệ');

const idParamsSchema = z.object({ id: objectId });
const documentParamsSchema = z.object({ id: objectId, docId: objectId });

const pageQuery = { page: z.string().optional(), limit: z.string().optional() };

// ---- subjects ----
const subjectBody = {
  name: z.string().trim().min(1, 'Tên môn không được để trống').max(120),
  description: z.string().trim().max(1000).optional(),
};
const createSubjectSchema = z.object(subjectBody);
const updateSubjectSchema = z
  .object({ name: subjectBody.name.optional(), description: subjectBody.description })
  .refine((v) => v.name !== undefined || v.description !== undefined, 'Không có thay đổi nào');

const listSubjectsQuerySchema = z.object({
  ...pageQuery,
  status: z.enum([SUBJECT_STATUS.ACTIVE, SUBJECT_STATUS.ARCHIVED]).optional(),
  q: z.string().trim().max(120).optional(),
});

const fromCatalogSchema = z.object({ catalogSubjectId: objectId });
const pinSchema = z.object({ pinned: z.boolean() });
const reorderSchema = z.object({ ids: z.array(objectId).min(1).max(200) });

// ---- catalog (admin) ----
const listCatalogQuerySchema = z.object({
  ...pageQuery,
  status: z.enum([SUBJECT_STATUS.ACTIVE, SUBJECT_STATUS.INACTIVE]).optional(),
  q: z.string().trim().max(120).optional(),
});

// ---- documents ----
// Multipart fields arrive as strings, so tags may be "a, b" and booleans "true"/"false".
const tagsField = z
  .preprocess(
    (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
    z.array(z.string().min(1).max(30)).max(10, 'Tối đa 10 thẻ'),
  )
  .optional();
const boolField = z
  .preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean())
  .optional();

const documentMeta = {
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional(),
  tags: tagsField,
  important: boolField,
  chapter: z.string().trim().max(200).optional(),
  topic: z.string().trim().max(200).optional(),
  concept: z.string().trim().max(200).optional(),
};

const uploadDocumentSchema = z.object(documentMeta);
const updateDocumentSchema = uploadDocumentSchema.refine(
  (v) => Object.values(v).some((x) => x !== undefined),
  'Không có thay đổi nào',
);
const uploadSharedDocumentSchema = z.object({ ...documentMeta, subjectId: objectId });

const listDocumentsQuerySchema = z.object({
  ...pageQuery,
  q: z.string().trim().max(200).optional(),
  tag: z.string().trim().max(30).optional(),
  important: boolField,
  chapter: z.string().trim().max(200).optional(),
  topic: z.string().trim().max(200).optional(),
  concept: z.string().trim().max(200).optional(),
  processingStatus: z.enum(Object.values(PROCESSING_STATUS)).optional(),
});
const listSharedDocumentsQuerySchema = listDocumentsQuerySchema.extend({ subjectId: objectId.optional() });

// Bulk import: files go in `files`, the optional `manifest` is a JSON array of per-file metadata (the classification table).
// Rows are only checked for shape here; each row is fully validated during the import so one bad row
// shows up in the report instead of rejecting the whole request.
const manifestRowSchema = z.object({ file: z.string().min(1) }).passthrough();
const importSharedDocumentsSchema = z.object({
  subjectId: objectId.optional(),
  manifest: z
    .preprocess((v) => {
      if (typeof v !== 'string' || !v.trim()) return [];
      try {
        return JSON.parse(v);
      } catch {
        return v;
      }
    }, z.array(manifestRowSchema, { invalid_type_error: 'Bảng phân loại không phải JSON hợp lệ' }))
    .optional(),
});

module.exports = {
  objectId,
  idParamsSchema,
  documentParamsSchema,
  createSubjectSchema,
  updateSubjectSchema,
  listSubjectsQuerySchema,
  fromCatalogSchema,
  pinSchema,
  reorderSchema,
  listCatalogQuerySchema,
  uploadDocumentSchema,
  updateDocumentSchema,
  uploadSharedDocumentSchema,
  listDocumentsQuerySchema,
  listSharedDocumentsQuerySchema,
  importSharedDocumentsSchema,
  documentMeta,
};
