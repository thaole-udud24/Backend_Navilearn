const { parsePagination } = require('../../utils/pagination');

describe('notification module', () => {
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

jest.mock('./notification.model');

// N13: real per-student read-tracking (markRead/markAllRead), added for the Thông báo page.
describe('markRead / markAllRead (N13)', () => {
  const NotificationItem = require('./notification.model');
  const { markRead, markAllRead } = require('./notification.service');

  beforeEach(() => jest.clearAllMocks());

  it('marks only the requester\'s own notification as read', async () => {
    const item = { read: false, save: jest.fn().mockResolvedValue(undefined) };
    NotificationItem.findOne.mockResolvedValue(item);
    const result = await markRead('n1', 'owner1');
    expect(NotificationItem.findOne).toHaveBeenCalledWith({ _id: 'n1', owner: 'owner1' });
    expect(item.read).toBe(true);
    expect(result).toBe(item);
  });

  it('404s when the notification does not belong to the requester (or does not exist)', async () => {
    NotificationItem.findOne.mockResolvedValue(null);
    await expect(markRead('n1', 'owner1')).rejects.toMatchObject({ status: 404 });
  });

  it('marks all of the owner\'s unread notifications read in one update', async () => {
    NotificationItem.updateMany.mockResolvedValue({ modifiedCount: 3 });
    await markAllRead('owner1');
    expect(NotificationItem.updateMany).toHaveBeenCalledWith(
      { owner: 'owner1', read: false },
      expect.objectContaining({ read: true }),
    );
  });
});

// B9: admin compose fan-out — real targeting against student accounts / subject enrollment.
jest.mock('../account/account.auth.model');
jest.mock('../student-subject/student-subject.model');
jest.mock('../knowledge/knowledge.model');

describe('broadcastCreate (B9)', () => {
  const NotificationItem = require('./notification.model');
  const User = require('../account/account.auth.model');
  const StudentSubjectItem = require('../student-subject/student-subject.model');
  const Concept = require('../knowledge/knowledge.model');
  const { broadcastCreate } = require('./notification.service');

  beforeEach(() => jest.clearAllMocks());

  it('"all" audience fans out to every active student', async () => {
    User.find.mockReturnValue({ distinct: jest.fn().mockResolvedValue(['s1', 's2', 's3']) });
    NotificationItem.insertMany.mockResolvedValue([]);

    const result = await broadcastCreate('admin1', {
      audience: { type: 'all' },
      category: 'he_thong',
      title: 'Bảo trì hệ thống',
      content: 'Hệ thống bảo trì lúc 23h',
    });

    expect(User.find).toHaveBeenCalledWith(expect.objectContaining({ role: 'student', isActive: true }));
    expect(NotificationItem.insertMany).toHaveBeenCalledTimes(1);
    const docs = NotificationItem.insertMany.mock.calls[0][0];
    expect(docs).toHaveLength(3);
    expect(docs.every((d) => d.broadcastId)).toBe(true);
    expect(new Set(docs.map((d) => String(d.broadcastId))).size).toBe(1); // one shared broadcastId
    expect(result.recipientCount).toBe(3);
  });

  it('"subject" audience fans out only to students enrolled in that subject', async () => {
    Concept.findOne.mockResolvedValue({ _id: 'subj1', name: 'Giải tích 1' });
    StudentSubjectItem.find.mockReturnValue({ distinct: jest.fn().mockResolvedValue(['s1', 's2']) });
    NotificationItem.insertMany.mockResolvedValue([]);

    const result = await broadcastCreate('admin1', {
      audience: { type: 'subject', subjectId: 'subj1' },
      category: 'hoc_tap',
      title: 'Cập nhật lộ trình',
      content: 'Lộ trình mẫu đã được cập nhật',
    });

    expect(StudentSubjectItem.find).toHaveBeenCalledWith({ concept: 'subj1' });
    const docs = NotificationItem.insertMany.mock.calls[0][0];
    expect(docs).toHaveLength(2);
    expect(docs[0].audienceLabel).toBe('SV môn Giải tích 1');
    expect(result.audienceLabel).toBe('SV môn Giải tích 1');
  });

  it('rejects an empty audience instead of silently sending nothing', async () => {
    User.find.mockReturnValue({ distinct: jest.fn().mockResolvedValue([]) });
    await expect(
      broadcastCreate('admin1', { audience: { type: 'all' }, category: 'he_thong', title: 't', content: 'c' }),
    ).rejects.toMatchObject({ status: 400 });
    expect(NotificationItem.insertMany).not.toHaveBeenCalled();
  });

  it('404s a subject audience targeting a non-existent/non-top-level concept', async () => {
    Concept.findOne.mockResolvedValue(null);
    await expect(
      broadcastCreate('admin1', {
        audience: { type: 'subject', subjectId: 'bad' },
        category: 'hoc_tap',
        title: 't',
        content: 'c',
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
