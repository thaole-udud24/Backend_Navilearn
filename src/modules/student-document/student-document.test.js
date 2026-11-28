jest.mock('./student-document.model');
jest.mock('../knowledge/knowledge.model');

describe('student-document validation', () => {
  const { createSchema } = require('./student-document.validation');

  it('accepts a minimal valid document', () => {
    expect(createSchema.safeParse({ title: 'Đề cương' }).success).toBe(true);
  });

  it('rejects a document with no title', () => {
    expect(createSchema.safeParse({ title: '' }).success).toBe(false);
  });

  it('rejects an invalid documentRole', () => {
    expect(createSchema.safeParse({ title: 'Đề cương', documentRole: 'NOT_A_ROLE' }).success).toBe(false);
  });

  it('accepts a valid concept id and turns an empty string into null (no subject)', () => {
    const withConcept = createSchema.safeParse({ title: 'Đề cương', concept: '507f1f77bcf86cd799439011' });
    expect(withConcept.success).toBe(true);
    expect(withConcept.data?.concept).toBe('507f1f77bcf86cd799439011');
    const cleared = createSchema.safeParse({ title: 'Đề cương', concept: '' });
    expect(cleared.success).toBe(true);
    expect(cleared.data?.concept).toBeNull();
  });

  it('rejects a malformed concept id', () => {
    expect(createSchema.safeParse({ title: 'Đề cương', concept: 'not-an-id' }).success).toBe(false);
  });
});

describe('student-document service', () => {
  const StudentDocumentItem = require('./student-document.model');
  const service = require('./student-document.service');

  beforeEach(() => jest.clearAllMocks());

  it('create stores the uploaded file metadata', async () => {
    StudentDocumentItem.countDocuments.mockResolvedValue(0);
    StudentDocumentItem.create.mockResolvedValue({ _id: 'd1' });
    const file = { filename: 'f.pdf', originalname: 'De cuong.pdf', mimetype: 'application/pdf', size: 1024 };
    await service.create('student1', { title: 'Đề cương' }, file);
    expect(StudentDocumentItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'student1',
        title: 'Đề cương',
        documentRole: 'SUPPLEMENT',
        fileUrl: '/uploads/student-documents/f.pdf',
        originalName: 'De cuong.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      }),
    );
  });

  it('create rejects once the per-owner cap is reached', async () => {
    StudentDocumentItem.countDocuments.mockResolvedValue(30);
    const file = { filename: 'f.pdf', originalname: 'f.pdf', mimetype: 'application/pdf', size: 1024 };
    await expect(service.create('student1', { title: 'X' }, file)).rejects.toMatchObject({
      code: 'DOCUMENT_LIMIT_REACHED',
    });
    expect(StudentDocumentItem.create).not.toHaveBeenCalled();
  });

  it('getOwned rejects when the document belongs to another student', async () => {
    StudentDocumentItem.findById.mockResolvedValue({ owner: 'other-student' });
    await expect(service.getOwned('d1', 'student1')).rejects.toThrow();
  });

  it('remove sets status to removed, not a hard delete', async () => {
    const item = { owner: 'student1', status: 'active', save: jest.fn().mockResolvedValue(undefined) };
    StudentDocumentItem.findById.mockResolvedValue(item);
    await service.remove('d1', 'student1');
    expect(item.status).toBe('removed');
    expect(item.save).toHaveBeenCalled();
  });

  it('update changes allowed fields only, scoped to the owner', async () => {
    const item = { owner: 'student1', save: jest.fn().mockResolvedValue(undefined) };
    StudentDocumentItem.findById.mockResolvedValue(item);
    await service.update('d1', 'student1', { title: 'New title' });
    expect(item.title).toBe('New title');
    expect(item.save).toHaveBeenCalled();
  });

  it('create stores the given concept (subject tag), defaulting to null', async () => {
    StudentDocumentItem.countDocuments.mockResolvedValue(0);
    StudentDocumentItem.create.mockResolvedValue({ _id: 'd1' });
    const file = { filename: 'f.pdf', originalname: 'f.pdf', mimetype: 'application/pdf', size: 1024 };
    await service.create('student1', { title: 'X', concept: 'concept1' }, file);
    expect(StudentDocumentItem.create).toHaveBeenCalledWith(expect.objectContaining({ concept: 'concept1' }));

    await service.create('student1', { title: 'Y' }, file);
    expect(StudentDocumentItem.create).toHaveBeenCalledWith(expect.objectContaining({ concept: null }));
  });

  it('update sets or clears the concept', async () => {
    const item = { owner: 'student1', concept: 'concept1', save: jest.fn().mockResolvedValue(undefined) };
    StudentDocumentItem.findById.mockResolvedValue(item);
    await service.update('d1', 'student1', { concept: null });
    expect(item.concept).toBeNull();
  });

  it('list filters by concept and populates its name', async () => {
    const chain = {
      sort: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      populate: jest.fn().mockResolvedValue([]),
    };
    StudentDocumentItem.find.mockReturnValue(chain);
    StudentDocumentItem.countDocuments.mockResolvedValue(0);

    await service.list('student1', { concept: 'concept1' });
    expect(StudentDocumentItem.find).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'student1', status: 'active', concept: 'concept1' }),
    );
    expect(chain.populate).toHaveBeenCalledWith('concept', 'name');
  });

  it('analyzeDocument matches active concepts and sets processingStatus READY', async () => {
    const Concept = require('../knowledge/knowledge.model');
    const doc = {
      _id: 'd1',
      owner: 'student1',
      title: 'Đề cương Vật chất và Ý thức',
      documentRole: 'SYLLABUS',
      tags: ['Triết học'],
      fileUrl: '/uploads/student-documents/missing.pdf',
      save: jest.fn().mockResolvedValue(undefined),
    };
    const populatedChain = {
      populate: jest.fn().mockReturnThis(),
    };
    populatedChain.populate.mockReturnValueOnce(populatedChain).mockResolvedValueOnce(doc);
    StudentDocumentItem.findById.mockReturnValueOnce(doc).mockReturnValueOnce(populatedChain);

    const conceptChain = {
      select: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      lean: jest.fn().mockResolvedValue([
        { _id: 'c1', name: 'Vật chất' },
        { _id: 'c2', name: 'Kinh tế chính trị' },
      ]),
    };
    Concept.find.mockReturnValue(conceptChain);

    await service.analyzeDocument('d1', 'student1');
    expect(doc.processingStatus).toBe('READY');
    expect(doc.suggestedConcepts).toEqual(['c1']);
    expect(doc.detectedTopics).toContain('Vật chất');
    expect(doc.save).toHaveBeenCalled();
  });
});
