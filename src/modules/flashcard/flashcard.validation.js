const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const createDeckSchema = z.object({
  title: z.string().trim().min(1).max(150),
  concept: objectId,
  description: z.string().trim().max(500).optional(),
});

const updateDeckSchema = createDeckSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'No fields to update');

const updateDeckStatusSchema = z.object({ status: z.enum(['active', 'archived']) });

const listDecksQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  concept: objectId.optional(),
  status: z.enum(['active', 'archived']).optional(),
});

const createCardSchema = z.object({
  front: z.string().trim().min(1).max(1000),
  back: z.string().trim().min(1).max(1000),
});

const updateCardSchema = createCardSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'No fields to update');

const updateCardStatusSchema = z.object({ status: z.enum(['active', 'archived']) });

const listCardsQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  status: z.enum(['active', 'archived']).optional(),
});

const idParamsSchema = z.object({ id: objectId });
const deckIdParamsSchema = z.object({ deckId: objectId });
const cardParamsSchema = z.object({ deckId: objectId, id: objectId });

module.exports = {
  createDeckSchema,
  updateDeckSchema,
  updateDeckStatusSchema,
  listDecksQuerySchema,
  createCardSchema,
  updateCardSchema,
  updateCardStatusSchema,
  listCardsQuerySchema,
  idParamsSchema,
  deckIdParamsSchema,
  cardParamsSchema,
};
