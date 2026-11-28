const { z } = require('zod');
const { DOCUMENT_ROLES } = require('../student-document/student-document.model');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');
const documentRoleField = z.enum(DOCUMENT_ROLES).optional();

// Multipart fields arrive as strings, so tags come as "a, b" and booleans as "true"/"false".
const tagsField = z
  .preprocess(
    (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
    z.array(z.string().min(1).max(30)).max(10, 'Tối đa 10 thẻ'),
  )
  .optional();
const boolField = z.preprocess((v) => (v === 'true' ? true : v === 'false' ? false : v), z.boolean()).optional();

// Multipart form fields alongside the uploaded file (handled separately by multer).
const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  concept: objectId.optional(),
  documentRole: documentRoleField,
  description: z.string().trim().max(500).optional(),
  tags: tagsField,
  important: boolField,
  studentVisible: boolField,
});

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    concept: objectId.optional(),
    documentRole: documentRoleField,
    description: z.string().trim().max(500).optional(),
    tags: tagsField,
    important: boolField,
    studentVisible: boolField,
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Không có thay đổi nào');

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  concept: objectId.optional(),
  subjectId: objectId.optional(),
});

const idParamsSchema = z.object({ id: objectId });

// Bulk import: files go in `files`, the optional `manifest` is a JSON array of per-file metadata.
// Rows are only checked for shape here; each row is fully validated during the import so one bad
// row shows up in the report instead of rejecting the whole request.
const manifestRowSchema = z.object({ file: z.string().min(1) }).passthrough();
const importSchema = z.object({
  concept: objectId.optional(),
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

module.exports = { createSchema, updateSchema, listQuerySchema, idParamsSchema, importSchema };
