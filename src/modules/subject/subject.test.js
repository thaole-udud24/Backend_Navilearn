process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/navilearn_test';
process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test_access_secret';
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test_refresh_secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../../app');
const v = require('./subject.validation');
const { escapeRegex, toPublicDocument } = require('./subject.helpers');

const VALID_ID = '64b7f0c2a1b2c3d4e5f60718';
const tokenFor = (role) =>
  jwt.sign({ sub: VALID_ID, role, sid: 'test-session' }, process.env.JWT_ACCESS_SECRET, { expiresIn: '5m' });

describe('subject validation', () => {
  it('rejects an empty subject name and trims whitespace', () => {
    expect(v.createSubjectSchema.safeParse({ name: '   ' }).success).toBe(false);
    expect(v.createSubjectSchema.parse({ name: '  Giải tích 1  ' }).name).toBe('Giải tích 1');
  });

  it('requires at least one field to update a subject', () => {
    expect(v.updateSubjectSchema.safeParse({}).success).toBe(false);
    expect(v.updateSubjectSchema.safeParse({ description: 'mới' }).success).toBe(true);
  });

  it('rejects ids that are not 24-char hex (avoids CastError)', () => {
    expect(v.idParamsSchema.safeParse({ id: 'abc' }).success).toBe(false);
    expect(v.idParamsSchema.safeParse({ id: VALID_ID }).success).toBe(true);
  });

  it('parses multipart tags/important sent as strings', () => {
    const out = v.uploadDocumentSchema.parse({ tags: 'ôn thi, chương 1 ,', important: 'true' });
    expect(out.tags).toEqual(['ôn thi', 'chương 1']);
    expect(out.important).toBe(true);
  });

  it('limits a document to 10 tags', () => {
    const tags = Array.from({ length: 11 }, (_, i) => `t${i}`).join(',');
    expect(v.uploadDocumentSchema.safeParse({ tags }).success).toBe(false);
  });

  it('parses the bulk-import manifest from a JSON string and rejects invalid JSON', () => {
    const ok = v.importSharedDocumentsSchema.parse({ manifest: JSON.stringify([{ file: 'a.pdf', name: 'A' }]) });
    expect(ok.manifest).toHaveLength(1);
    expect(v.importSharedDocumentsSchema.safeParse({ manifest: '{not json' }).success).toBe(false);
  });
});

describe('subject helpers', () => {
  it('escapes regex metacharacters so user search cannot inject a pattern', () => {
    expect(escapeRegex('C++ (a.b)')).toBe('C\\+\\+ \\(a\\.b\\)');
  });

  it('never exposes the stored file name', () => {
    const doc = toPublicDocument({
      id: '1',
      subject: VALID_ID,
      file: { originalName: 'a.pdf', storedName: 'secret-uuid.pdf', mimeType: 'application/pdf', size: 10 },
      classification: {},
      tags: [],
    });
    expect(JSON.stringify(doc)).not.toContain('secret-uuid');
  });
});

describe('subject routes (no database needed)', () => {
  it('requires a token', async () => {
    const res = await request(app).get('/api/v1/subject-items');
    expect(res.status).toBe(401);
  });

  it('rejects a malformed subject id with 400 before touching the database', async () => {
    const res = await request(app).get('/api/v1/subject-items/not-an-id').set('Authorization', `Bearer ${tokenFor('student')}`);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('rejects an invalid create body', async () => {
    const res = await request(app)
      .post('/api/v1/subject-items')
      .set('Authorization', `Bearer ${tokenFor('student')}`)
      .send({ name: '' });
    expect(res.status).toBe(400);
  });

  it('rejects a non-PDF/DOCX upload', async () => {
    const res = await request(app)
      .post(`/api/v1/subject-items/${VALID_ID}/documents`)
      .set('Authorization', `Bearer ${tokenFor('student')}`)
      .attach('file', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILE_TYPE');
  });

  it('rejects a file whose content is not really a PDF', async () => {
    const res = await request(app)
      .post(`/api/v1/subject-items/${VALID_ID}/documents`)
      .set('Authorization', `Bearer ${tokenFor('student')}`)
      .attach('file', Buffer.from('not a pdf at all'), { filename: 'fake.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_FILE_TYPE');
  });
});
