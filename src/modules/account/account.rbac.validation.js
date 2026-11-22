const { z } = require('zod');
const { ROLES } = require('../../shared/roles');

const role = z.enum(Object.values(ROLES));
const matrixQuerySchema = z.object({
  role: role.optional(),
  module: z.string().trim().max(10).optional(),
  search: z.string().trim().max(100).optional(),
});
const exportQuerySchema = matrixQuerySchema;
const userParamsSchema = z.object({ userId: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid user id') });
const deniedQuerySchema = z.object({
  page: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
  role: role.optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

module.exports = { matrixQuerySchema, exportQuerySchema, userParamsSchema, deniedQuerySchema };
