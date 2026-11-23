const { z } = require('zod');
const { ROLES } = require('../../shared/roles');
const { passwordField, emailField } = require('./account.auth.validation');

const roleEnum = z.enum(Object.values(ROLES));

const listQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  search: z.string().trim().max(100).optional(),
  role: roleEnum.optional(),
  status: z.enum(['active', 'locked', 'unverified']).optional(),
});

const idParamsSchema = z.object({
  id: z.string().regex(/^[a-f\d]{24}$/i, 'Invalid id'),
});

const createUserSchema = z.object({
  email: emailField,
  fullName: z.string().trim().min(1).max(100),
  role: roleEnum.default(ROLES.STUDENT),
  password: passwordField,
});

const updateUserSchema = z
  .object({
    email: emailField,
    fullName: z.string().trim().min(1).max(100),
    role: roleEnum,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

const lockSchema = z.object({
  reason: z.string().trim().min(1, 'Lý do khóa không được để trống').max(500),
});

const auditQuerySchema = z.object({
  page: z.string().optional(),
  limit: z.string().optional(),
  action: z.string().trim().max(60).optional(),
});

module.exports = {
  listQuerySchema,
  idParamsSchema,
  createUserSchema,
  updateUserSchema,
  lockSchema,
  auditQuerySchema,
};
