const { z } = require('zod');
const { ROLES } = require('../../shared/roles');

const roleQuerySchema = z.object({
  role: z.enum(Object.values(ROLES)).optional(),
});

const accountIdParamsSchema = z.object({
  accountId: z.string().regex(/^[0-9a-fA-F]{24}$/, 'ID không hợp lệ'),
});

const deniedLogQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

module.exports = { roleQuerySchema, accountIdParamsSchema, deniedLogQuerySchema };
