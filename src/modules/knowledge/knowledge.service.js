const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const Concept = require('./knowledge.model');
const { ROLES } = require('../../shared/roles');

async function create(ownerId, data) {
  return Concept.create({ owner: ownerId, createdBy: ownerId, ...data });
}

// Concepts are shared content: every authenticated user sees the same list (students default to active only).
async function list(query, requester) {
  const { page, limit, skip } = parsePagination(query);
  // Non-admins are always forced to 'active', ignoring any status they ask for — only admins may
  // pass their own status filter (or none, to see every status).
  const filter = requester.role === ROLES.ADMIN ? (query.status ? { status: query.status } : {}) : { status: 'active' };
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
