const { z } = require('zod');

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id');

const dueQuerySchema = z.object({
  deck: objectId.optional(),
  concept: objectId.optional(),
  subjectId: objectId.optional(),
  limit: z.string().optional(),
});

const statsQuerySchema = z.object({ deck: objectId.optional(), subjectId: objectId.optional() });

const cardIdParamsSchema = z.object({ cardId: objectId });

const reviewSchema = z.object({ grade: z.enum(['again', 'hard', 'good', 'easy']) });

module.exports = { dueQuerySchema, statsQuerySchema, cardIdParamsSchema, reviewSchema };
