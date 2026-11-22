process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const service = require('./account.rbac.service');
const { ROLE_CATALOG, PERMISSION_MATRIX, effectivePermissions } = require('./account.rbac.permissions');

describe('RBAC catalog and permission matrix', () => {
  it('exposes only the two BRD login roles', () => {
    expect(ROLE_CATALOG.map((role) => role.code)).toEqual(['student', 'admin']);
  });

  it('does not grant admin access to personal learning data', () => {
    const personal = PERMISSION_MATRIX.filter((row) =>
      ['ASM', 'MST', 'PLN', 'ADP', 'REV', 'RSK', 'AIA', 'RPT'].includes(row.module),
    );
    expect(personal.every((row) => row.admin === 'none')).toBe(true);
  });

  it('derives effective permissions and filters the matrix', () => {
    expect(effectivePermissions('student').some((permission) => permission.module === 'PLN')).toBe(true);
    expect(service.matrix({ role: 'admin', module: 'RBAC' })).toHaveLength(2);
    expect(service.matrix({ search: 'rubric' })).toHaveLength(1);
  });
});

describe('RBAC route access', () => {
  const tokenFor = (role) =>
    jwt.sign({ sub: '64b000000000000000000001', role, sid: 'x' }, process.env.JWT_ACCESS_SECRET);

  it('requires authentication', async () => {
    expect((await request(app).get('/api/v1/rbac-items/matrix')).status).toBe(401);
  });

  it('rejects student access', async () => {
    const res = await request(app)
      .get('/api/v1/rbac-items/matrix')
      .set('Authorization', `Bearer ${tokenFor('student')}`);
    expect(res.status).toBe(403);
  });

  it('returns the matrix to an admin without database access', async () => {
    const res = await request(app)
      .get('/api/v1/rbac-items/matrix')
      .set('Authorization', `Bearer ${tokenFor('admin')}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(PERMISSION_MATRIX.length);
  });

  it('validates effective-permission account ids', async () => {
    const res = await request(app)
      .get('/api/v1/rbac-items/effective/not-an-id')
      .set('Authorization', `Bearer ${tokenFor('admin')}`);
    expect(res.status).toBe(400);
  });
});
