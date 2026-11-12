process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/navilearn_test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret';

const request = require('supertest');
const app = require('./app');

describe('GET /api/v1/health', () => {
  it('returns 200 and status ok', async () => {
    const res = await request(app).get('/api/v1/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { status: 'ok' }, message: 'OK' });
  });
});

describe('unknown route', () => {
  it('returns 404 with standard error shape', async () => {
    const res = await request(app).get('/api/v1/does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe('ROUTE_NOT_FOUND');
  });
});
