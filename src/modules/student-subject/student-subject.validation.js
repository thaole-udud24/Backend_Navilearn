const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const createSchema = z
  .object({
    concept: objectId.optional(),
    customTitle: z.string().trim().min(1).max(200).optional(),
    customDescription: z.string().trim().max(500).optional(),
    customColor: z.string().trim().max(20).optional(),
  })
  .refine((o) => !!o.concept !== !!o.customTitle, 'Chọn một môn có sẵn hoặc đặt tên môn của riêng bạn');

const updateSchema = z
  .object({
    pinned: z.boolean().optional(),
    displayOrder: z.number().int().optional(),
  })
  .refine((o) => Object.keys(o).length > 0, 'No fields to update');

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
});

const idParamsSchema = z.object({ id: objectId });

module.exports = { createSchema, updateSchema, listQuerySchema, idParamsSchema };
