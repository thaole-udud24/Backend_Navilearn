const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const Concept = require('./knowledge.model');

async function create(ownerId, data) {
  return Concept.create({ owner: ownerId, createdBy: ownerId, ...data });
}

// Concepts are shared content: every authenticated user sees the same list (students default to active only).
async function list(query, requester) {
  const { page, limit, skip } = parsePagination(query);
  const filter = query.status ? { status: query.status } : requester.role === 'admin' ? {} : { status: 'active' };
  const [items, total] = await Promise.all([
    Concept.find(filter).sort({ order: 1, createdAt: -1 }).skip(skip).limit(limit),
    Concept.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const item = await Concept.findById(id);
  if (!item) throw ApiError.notFound('Concept not found');
  return item;
}

async function updateStatus(id, requesterId, status) {
  const item = await getById(id);
  item.status = status;
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

async function remove(id) {
  const item = await getById(id);
  await item.softDelete();
}

module.exports = { create, list, getById, updateStatus, remove };
