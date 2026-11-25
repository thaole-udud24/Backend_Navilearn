const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

// Multipart form fields alongside the uploaded file (handled separately by multer).
const createSchema = z.object({
  title: z.string().trim().min(1).max(200),
  concept: objectId.optional(),
  description: z.string().trim().max(500).optional(),
});

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  concept: objectId.optional(),
});

const idParamsSchema = z.object({ id: objectId });

module.exports = { createSchema, listQuerySchema, idParamsSchema };
