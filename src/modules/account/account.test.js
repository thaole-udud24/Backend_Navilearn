process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/navilearn_test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const { checkPassword } = require('./account.password.policy');
const { toCsv, escapeCell } = require('./account.csv');
const { generateOtp, sha256, safeEqual } = require('./account.crypto');
const { toAdminUser } = require('./account.public');

describe('password policy (BR-49)', () => {
  it('rejects passwords shorter than 8 and longer than 64 characters', () => {
    expect(checkPassword('Ab1')).toMatch(/tối thiểu 8/);
    expect(checkPassword('a'.repeat(65))).toMatch(/tối đa 64/);
  });

  it('accepts a long passphrase with spaces and no digits/uppercase', () => {
    expect(checkPassword('correct horse battery staple')).toBeNull();
  });

  it('rejects common passwords regardless of case', () => {
    expect(checkPassword('Password123')).toMatch(/phổ biến/);
    expect(checkPassword('12345678')).toMatch(/phổ biến/);
  });

  it('rejects a password that contains the email or the full name', () => {
    expect(checkPassword('minhnguyen2026!', { email: 'minhnguyen@gmail.com' })).toMatch(/email/);
    expect(checkPassword('xx-nguyenvanminh-xx', { fullName: 'Nguyễn Văn Minh' })).toMatch(/họ tên/);
  });
});

describe('csv export', () => {
  it('quotes cells with commas/quotes and neutralises spreadsheet formulas', () => {
    expect(escapeCell('a,b')).toBe('"a,b"');
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
    expect(escapeCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(escapeCell(null)).toBe('');
  });

  it('writes a BOM, a header row and one line per row', () => {
    const csv = toCsv([{ n: 'An' }], [{ header: 'Tên', value: (r) => r.n }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1).trim().split('\r\n')).toEqual(['Tên', 'An']);
  });
});

describe('crypto helpers', () => {
  it('generates 6-digit OTPs', () => {
    for (let i = 0; i < 50; i += 1) expect(generateOtp()).toMatch(/^\d{6}$/);
  });

  it('compares hashes in constant time and rejects different lengths', () => {
    expect(safeEqual(sha256('a'), sha256('a'))).toBe(true);
    expect(safeEqual(sha256('a'), sha256('b'))).toBe(false);
    expect(safeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('admin DTO (BR-02)', () => {
  it('never exposes the password hash or tokens', () => {
    const dto = toAdminUser({
      id: '1',
      email: 'a@b.c',
      fullName: 'A',
      role: 'student',
      isActive: true,
      emailVerified: true,
      passwordHash: 'secret',
      createdAt: new Date(),
    });
    expect(JSON.stringify(dto)).not.toMatch(/secret|passwordHash|token/i);
  });
});

describe('auth routes validation (no database needed)', () => {
  it('POST /auth/register rejects a short password with 400', async () => {
    const res = await request(app).post('/api/v1/auth/register').send({ email: 'a@b.co', password: 'short', fullName: 'A' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('POST /auth/verify-email rejects a non 6-digit code with 400', async () => {
    const res = await request(app).post('/api/v1/auth/verify-email').send({ email: 'a@b.co', otp: '12ab' });
    expect(res.status).toBe(400);
  });

  it('POST /auth/reset-password requires a reset token', async () => {
    const res = await request(app).post('/api/v1/auth/reset-password').send({ password: 'a long enough passphrase' });
    expect(res.status).toBe(400);
  });
});

describe('access control', () => {
  const tokenFor = (role) => jwt.sign({ sub: '64b000000000000000000001', role, sid: 'x' }, process.env.JWT_ACCESS_SECRET);

  it('GET /me/profile without a token returns 401', async () => {
    const res = await request(app).get('/api/v1/me/profile');
    expect(res.status).toBe(401);
  });

  it('GET /admin/users returns 401 without a token', async () => {
    const res = await request(app).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
  });

  it('GET /admin/users returns 403 for a student', async () => {
    const res = await request(app).get('/api/v1/admin/users').set('Authorization', `Bearer ${tokenFor('student')}`);
    expect(res.status).toBe(403);
  });

  it('PATCH /admin/users/:id rejects an invalid id with 400 before touching the database', async () => {
    const res = await request(app)
      .patch('/api/v1/admin/users/not-an-id')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .send({ fullName: 'X' });
    expect(res.status).toBe(400);
  });

  it('POST /admin/users/:id/lock requires a reason', async () => {
    const res = await request(app)
      .post('/api/v1/admin/users/64b000000000000000000002/lock')
      .set('Authorization', `Bearer ${tokenFor('admin')}`)
      .send({ reason: '   ' });
    expect(res.status).toBe(400);
  });
});
