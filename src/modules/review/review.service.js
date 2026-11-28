const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const ReviewItem = require('./review.model');
const { ROLES } = require('../../shared/roles');

async function create(ownerId, data) {
  return ReviewItem.create({ owner: ownerId, createdBy: ownerId, ...data });
}

async function listForOwner(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { owner: ownerId, ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    ReviewItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ReviewItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function listAll(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {
    ...(query.status ? { status: query.status } : {}),
    ...(query.category ? { category: query.category } : {}),
    ...(query.rating ? { rating: Number(query.rating) } : {}),
  };
  const [items, total] = await Promise.all([
    // B11: admin triage table shows which student left each review.
    ReviewItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('owner', 'email fullName'),
    ReviewItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

// B11: real aggregate stats for the admin tiles (Điểm TB / Số đánh giá / Chưa xem) and per-category
// breakdown — computed from actual ReviewItem documents, not invented numbers.
async function stats() {
  const [overall] = await ReviewItem.aggregate([
    { $group: { _id: null, avgRating: { $avg: '$rating' }, total: { $sum: 1 } } },
  ]);
  const byCategory = await ReviewItem.aggregate([
    { $group: { _id: '$category', avgRating: { $avg: '$rating' }, total: { $sum: 1 } } },
    { $project: { _id: 0, category: '$_id', avgRating: 1, total: 1 } },
  ]);
  const unseen = await ReviewItem.countDocuments({ status: 'open' });
  return {
    avgRating: overall?.avgRating ?? 0,
    total: overall?.total ?? 0,
    unseen,
    byCategory,
  };
}

async function getOwned(id, requester) {
  const item = await ReviewItem.findById(id);
  if (!item) throw ApiError.notFound('Item not found');
  if (requester.role !== ROLES.ADMIN && String(item.owner) !== String(requester.id)) {
    throw ApiError.forbidden('Not the owner of this item');
  }
  return item;
}

async function updateStatus(id, requesterId, status) {
  const item = await ReviewItem.findById(id);
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

module.exports = { create, listForOwner, listAll, getOwned, updateStatus, remove, stats };
