const { parsePagination } = require('../../utils/pagination');
const { createSchema } = require('./admin-report.validation');

describe('admin-report module', () => {
  it('parsePagination defaults page=1 limit=20', () => {
    const { page, limit, skip } = parsePagination({});
    expect(page).toBe(1);
    expect(limit).toBe(20);
    expect(skip).toBe(0);
  });

  it('parsePagination caps limit at 100', () => {
    const { limit } = parsePagination({ limit: '500' });
    expect(limit).toBe(100);
  });
});

// N11: Loại sự cố + Vị trí — real, validated fields instead of free text only.
describe('createSchema (N11 issueType/location)', () => {
  it('accepts a report with no issueType/location (both optional, back-compat)', () => {
    expect(createSchema.safeParse({ title: 't', content: 'c' }).success).toBe(true);
  });

  it('accepts a report with a valid issueType and location', () => {
    const result = createSchema.safeParse({
      title: 't',
      content: 'c',
      issueType: 'question_error',
      location: 'Trang Luyện tập, câu 3',
    });
    expect(result.success).toBe(true);
  });

  it('rejects an issueType outside the enum', () => {
    expect(createSchema.safeParse({ title: 't', content: 'c', issueType: 'bug_report' }).success).toBe(false);
  });
});

// B10: admin triage reply.
jest.mock('./admin-report.model');

describe('respond (B10)', () => {
  const AdminReportItem = require('./admin-report.model');
  const { respond } = require('./admin-report.service');

  beforeEach(() => jest.clearAllMocks());

  it('sets adminResponse/respondedBy/respondedAt on the item', async () => {
    const item = { save: jest.fn().mockResolvedValue(undefined) };
    AdminReportItem.findById.mockResolvedValue(item);

    const result = await respond('r1', 'admin1', 'Đã khắc phục, bạn thử lại nhé.');

    expect(item.adminResponse).toBe('Đã khắc phục, bạn thử lại nhé.');
    expect(item.respondedBy).toBe('admin1');
    expect(item.respondedAt).toBeInstanceOf(Date);
    expect(item.save).toHaveBeenCalled();
    expect(result).toBe(item);
  });

  it('404s when the report does not exist', async () => {
    AdminReportItem.findById.mockResolvedValue(null);
    await expect(respond('missing', 'admin1', 'x')).rejects.toMatchObject({ status: 404 });
  });
});

// N11: optional screenshot attachment on create.
describe('create (N11 attachmentUrl)', () => {
  const AdminReportItem = require('./admin-report.model');
  const { create } = require('./admin-report.service');

  beforeEach(() => jest.clearAllMocks());

  it('sets attachmentUrl from the uploaded file when one is given', async () => {
    AdminReportItem.create.mockResolvedValue({ attachmentUrl: '/uploads/admin-report-attachments/abc.png' });
    await create('owner1', { title: 't', content: 'c', issueType: 'display_bug' }, { filename: 'abc.png' });

    expect(AdminReportItem.create).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'owner1',
        title: 't',
        issueType: 'display_bug',
        attachmentUrl: '/uploads/admin-report-attachments/abc.png',
      }),
    );
  });

  it('leaves attachmentUrl null when no file was uploaded', async () => {
    AdminReportItem.create.mockResolvedValue({});
    await create('owner1', { title: 't', content: 'c' }, undefined);

    expect(AdminReportItem.create).toHaveBeenCalledWith(expect.objectContaining({ attachmentUrl: null }));
  });
});
