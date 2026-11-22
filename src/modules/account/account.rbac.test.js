const { PERMISSION_MATRIX } = require('../../shared/permission-matrix');
const { ROLES } = require('../../shared/roles');
const { roleQuerySchema, accountIdParamsSchema } = require('./account.rbac.validation');
const { getPermissionMatrix } = require('./account.rbac.service');

describe('account rbac submodule (UC-RBAC)', () => {
  it('permission matrix covers every module with both roles defined', () => {
    expect(PERMISSION_MATRIX.length).toBeGreaterThan(0);
    PERMISSION_MATRIX.forEach((row) => {
      expect(row.roles[ROLES.STUDENT]).toBeDefined();
      expect(row.roles[ROLES.ADMIN]).toBeDefined();
    });
  });

  it('getPermissionMatrix(undefined) returns full matrix', () => {
    expect(getPermissionMatrix(undefined)).toBe(PERMISSION_MATRIX);
  });

  it('getPermissionMatrix(role) only keeps that role column', () => {
    const filtered = getPermissionMatrix(ROLES.STUDENT);
    filtered.forEach((row) => {
      expect(Object.keys(row.roles)).toEqual([ROLES.STUDENT]);
    });
  });

  it('rejects an invalid role in query', () => {
    expect(roleQuerySchema.safeParse({ role: 'superadmin' }).success).toBe(false);
  });

  it('rejects a malformed accountId param', () => {
    expect(accountIdParamsSchema.safeParse({ accountId: 'abc' }).success).toBe(false);
  });

  it('accepts a valid accountId param', () => {
    expect(accountIdParamsSchema.safeParse({ accountId: '507f1f77bcf86cd799439011' }).success).toBe(true);
  });
});
