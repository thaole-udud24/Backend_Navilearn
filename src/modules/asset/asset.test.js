jest.mock('./asset.model');

describe('asset validation', () => {
  const { createSchema } = require('./asset.validation');

  it('accepts a minimal valid asset', () => {
    expect(createSchema.safeParse({ title: 'Giáo trình' }).success).toBe(true);
  });

  it('rejects an asset with no title', () => {
    expect(createSchema.safeParse({ title: '' }).success).toBe(false);
  });
});

describe('asset service', () => {
  const AssetItem = require('./asset.model');
  const service = require('./asset.service');

  beforeEach(() => jest.clearAllMocks());

  it('create stores the uploaded file metadata', async () => {
    AssetItem.create.mockResolvedValue({ _id: 'a1' });
    const file = { filename: 'f.pdf', originalname: 'Giao trinh.pdf', mimetype: 'application/pdf', size: 1024 };
    await service.create('admin1', { title: 'Giáo trình' }, file);
    expect(AssetItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Giáo trình',
        fileUrl: '/uploads/assets/f.pdf',
        originalName: 'Giao trinh.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 1024,
      }),
    );
  });

  it('remove sets status to removed, not a hard delete', async () => {
    const item = { status: 'active', save: jest.fn().mockResolvedValue(undefined) };
    AssetItem.findById.mockReturnValue({ populate: () => item });
    await service.remove('a1', 'admin1');
    expect(item.status).toBe('removed');
    expect(item.save).toHaveBeenCalled();
  });

  it('create defaults studentVisible to true (D3 — matches the pre-existing de-facto behavior)', async () => {
    AssetItem.create.mockResolvedValue({ _id: 'a1' });
    const file = { filename: 'f.pdf', originalname: 'Giao trinh.pdf', mimetype: 'application/pdf', size: 1024 };
    await service.create('admin1', { title: 'Giáo trình' }, file);
    expect(AssetItem.create).toHaveBeenCalledWith(expect.objectContaining({ studentVisible: true }));
  });

  it('list (D3): a student only sees studentVisible assets, an admin sees all', async () => {
    AssetItem.find.mockReturnValue({
      sort: () => ({ skip: () => ({ limit: () => ({ populate: () => [] }) }) }),
    });
    AssetItem.countDocuments.mockResolvedValue(0);

    await service.list({}, { role: 'student' });
    expect(AssetItem.find).toHaveBeenCalledWith(expect.objectContaining({ studentVisible: true }));

    AssetItem.find.mockClear();
    await service.list({}, { role: 'admin' });
    expect(AssetItem.find).toHaveBeenCalledWith(
      expect.not.objectContaining({ studentVisible: expect.anything() }),
    );
  });
});
