const { z } = require('zod');
const { DOCUMENT_ROLES } = require('./student-document.model');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

// Multipart fields arrive as strings, so tags come as "a, b" (see asset.validation.js).
const tagsField = z
  .preprocess(
    (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
    z.array(z.string().min(1).max(30)).max(10, 'Tối đa 10 thẻ'),
  )
  .optional();

// Multipart fields arrive as strings; '' means "no subject" (cleared), same convention as tags.
const conceptField = z
  .union([objectId, z.literal('')])
  .optional()
  .transform((v) => (v ? v : v === '' ? null : v));

const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  documentRole: z.enum(DOCUMENT_ROLES).optional(),
  description: z.string().trim().max(500).optional(),
  tags: tagsField,
  concept: conceptField,
});

const updateSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    documentRole: z.enum(DOCUMENT_ROLES).optional(),
    description: z.string().trim().max(500).optional(),
    tags: tagsField,
    concept: conceptField,
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), 'Không có thay đổi nào');

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  documentRole: z.enum(DOCUMENT_ROLES).optional(),
  concept: objectId.optional(),
  subjectId: objectId.optional(),
});

const idParamsSchema = z.object({ id: objectId });

module.exports = { createSchema, updateSchema, listQuerySchema, idParamsSchema };
