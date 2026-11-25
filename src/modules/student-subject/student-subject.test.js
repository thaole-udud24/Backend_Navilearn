jest.mock('./student-subject.model');
jest.mock('../knowledge/knowledge.model');

describe('student-subject validation', () => {
  const { createSchema } = require('./student-subject.validation');
  const cid = 'a'.repeat(24);

  it('accepts a valid concept id', () => {
    expect(createSchema.safeParse({ concept: cid }).success).toBe(true);
  });

  it('rejects a malformed concept id', () => {
    expect(createSchema.safeParse({ concept: 'x' }).success).toBe(false);
  });

  it('accepts a custom title with no concept', () => {
    expect(createSchema.safeParse({ customTitle: 'Môn tự học' }).success).toBe(true);
  });

  it('rejects neither concept nor customTitle', () => {
    expect(createSchema.safeParse({}).success).toBe(false);
  });

  it('rejects both concept and customTitle at once', () => {
    expect(createSchema.safeParse({ concept: cid, customTitle: 'Môn tự học' }).success).toBe(false);
  });
});

describe('student-subject service', () => {
  const StudentSubjectItem = require('./student-subject.model');
  const Concept = require('../knowledge/knowledge.model');
  const service = require('./student-subject.service');
  const cid = 'a'.repeat(24);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('create rejects a concept that does not exist', async () => {
    Concept.findOne.mockResolvedValue(null);
    await expect(service.create('u1', { concept: cid })).rejects.toMatchObject({
      status: 400,
      code: 'CONCEPT_NOT_FOUND',
    });
  });

  it('create rejects a non-top-level concept', async () => {
    Concept.findOne.mockResolvedValue({ _id: cid, parentConcept: 'p1' });
    await expect(service.create('u1', { concept: cid })).rejects.toMatchObject({
      status: 400,
      code: 'NOT_TOP_LEVEL_CONCEPT',
    });
  });

  it('create rejects adding the same subject twice', async () => {
    Concept.findOne.mockResolvedValue({ _id: cid, parentConcept: null });
    StudentSubjectItem.findOne.mockResolvedValue({ _id: 's1' });
    await expect(service.create('u1', { concept: cid })).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_ADDED',
    });
  });

  it('create succeeds for a fresh top-level concept', async () => {
    Concept.findOne.mockResolvedValue({ _id: cid, parentConcept: null });
    StudentSubjectItem.findOne.mockResolvedValue(null);
    StudentSubjectItem.create.mockResolvedValue({ _id: 's1', owner: 'u1', concept: cid });
    await expect(service.create('u1', { concept: cid })).resolves.toMatchObject({ _id: 's1' });
  });

  it('create rejects a duplicate custom title (case-insensitive)', async () => {
    StudentSubjectItem.findOne.mockResolvedValue({ _id: 's1' });
    await expect(service.create('u1', { customTitle: 'Môn Tự Học' })).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_ADDED',
    });
  });

  it('create succeeds for a fresh custom title', async () => {
    StudentSubjectItem.findOne.mockResolvedValue(null);
    StudentSubjectItem.create.mockResolvedValue({ _id: 's1', owner: 'u1', customTitle: 'Môn tự học' });
    await expect(service.create('u1', { customTitle: 'Môn tự học' })).resolves.toMatchObject({ _id: 's1' });
  });

  it('getOwned rejects a non-owner', async () => {
    StudentSubjectItem.findById.mockResolvedValue({ _id: 's1', owner: 'u1' });
    await expect(service.getOwned('s1', { id: 'u2' })).rejects.toMatchObject({ status: 403 });
  });
});
