const mongoose = require('mongoose');
const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const NotificationItem = require('./notification.model');
const User = require('../account/account.auth.model');
const StudentSubjectItem = require('../student-subject/student-subject.model');
const Concept = require('../knowledge/knowledge.model');
const { ROLES } = require('../../shared/roles');

async function create(ownerId, data) {
  return NotificationItem.create({ owner: ownerId, createdBy: ownerId, ...data });
}

async function listForOwner(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {
    owner: ownerId,
    ...(query.status ? { status: query.status } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.read !== undefined ? { read: query.read === 'true' } : {}),
  };
  const [items, total] = await Promise.all([
    NotificationItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    NotificationItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function listAll(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = query.status ? { status: query.status } : {};
  const [items, total] = await Promise.all([
    NotificationItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    NotificationItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getOwned(id, requester) {
  const item = await NotificationItem.findById(id);
  if (!item) throw ApiError.notFound('Item not found');
  if (requester.role !== ROLES.ADMIN && String(item.owner) !== String(requester.id)) {
    throw ApiError.forbidden('Not the owner of this item');
  }
  return item;
}

async function updateStatus(id, requesterId, status) {
  const item = await NotificationItem.findById(id);
  if (!item) throw ApiError.notFound('Item not found');
  item.status = status;
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

async function remove(id, requester) {
  const item = await getOwned(id, requester);
  await item.softDelete();
}

// N13: student marks one of their own notifications read on click.
async function markRead(id, ownerId) {
  const item = await NotificationItem.findOne({ _id: id, owner: ownerId });
  if (!item) throw ApiError.notFound('Item not found');
  item.read = true;
  item.updatedBy = ownerId;
  await item.save();
  return item;
}

// N13 "Đánh dấu đã đọc tất cả".
async function markAllRead(ownerId) {
  await NotificationItem.updateMany({ owner: ownerId, read: false }, { read: true, updatedBy: ownerId });
}

// B9: resolve an admin broadcast's audience to a real set of student owner ids, against actual
// enrollment data — "all" is every active student account, "subject" is every student who put that
// top-level Concept in their "Khoá học của tôi" (StudentSubjectItem.concept), there being no
// separate Subject/Course entity in this codebase (see student-subject.model.js).
async function resolveAudience(audience) {
  if (audience.type === 'subject') {
    const subject = await Concept.findOne({ _id: audience.subjectId, parentConcept: null });
    if (!subject) throw ApiError.notFound('Subject not found');
    const ownerIds = await StudentSubjectItem.find({ concept: audience.subjectId }).distinct('owner');
    return { ownerIds, label: `SV môn ${subject.name}` };
  }
  const ownerIds = await User.find({ role: ROLES.STUDENT, isActive: true }).distinct('_id');
  return { ownerIds, label: 'Tất cả sinh viên' };
}

// B9: admin compose — fans out one real NotificationItem per targeted student, tagged with a
// shared broadcastId so "Đã gửi" history (listBroadcasts) can group them back into one row.
async function broadcastCreate(adminId, data) {
  const { ownerIds, label } = await resolveAudience(data.audience);
  if (!ownerIds.length) throw ApiError.badRequest('Không có sinh viên phù hợp với đối tượng đã chọn', 'EMPTY_AUDIENCE');
  const broadcastId = new mongoose.Types.ObjectId();
  const docs = ownerIds.map((ownerId) => ({
    owner: ownerId,
    createdBy: adminId,
    title: data.title,
    content: data.content,
    category: data.category,
    link: data.link ?? null,
    broadcastId,
    audienceLabel: label,
  }));
  await NotificationItem.insertMany(docs);
  return { broadcastId: String(broadcastId), audienceLabel: label, category: data.category, title: data.title, recipientCount: docs.length };
}

// B9: "Đã gửi" history — one row per broadcastId with a real read rate (readCount/total), not per
// per-student row.
async function listBroadcasts(query) {
  const { page, limit, skip } = parsePagination(query);
  const match = { broadcastId: { $ne: null } };
  const [items, totalAgg] = await Promise.all([
    NotificationItem.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$broadcastId',
          title: { $first: '$title' },
          category: { $first: '$category' },
          audienceLabel: { $first: '$audienceLabel' },
          createdAt: { $min: '$createdAt' },
          total: { $sum: 1 },
          readCount: { $sum: { $cond: ['$read', 1, 0] } },
        },
      },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 0,
          broadcastId: '$_id',
          title: 1,
          category: 1,
          audienceLabel: 1,
          createdAt: 1,
          total: 1,
          readCount: 1,
        },
      },
    ]),
    NotificationItem.aggregate([{ $match: match }, { $group: { _id: '$broadcastId' } }, { $count: 'total' }]),
  ]);
  return { items, meta: buildMeta(page, limit, totalAgg[0]?.total ?? 0) };
}

module.exports = {
  create,
  listForOwner,
  listAll,
  getOwned,
  updateStatus,
  remove,
  markRead,
  markAllRead,
  broadcastCreate,
  listBroadcasts,
};
