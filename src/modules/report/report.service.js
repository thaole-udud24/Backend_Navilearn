const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const ReportItem = require('./report.model');
const { ROLES } = require('../../shared/roles');

async function create(ownerId, data) {
  return ReportItem.create({ owner: ownerId, createdBy: ownerId, ...data });
}

async function listForOwner(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { owner: ownerId, ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    ReportItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ReportItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function listAll(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = query.status ? { status: query.status } : {};
  const [items, total] = await Promise.all([
    ReportItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    ReportItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getOwned(id, requester) {
  const item = await ReportItem.findById(id);
  if (!item) throw ApiError.notFound('Item not found');
  if (requester.role !== ROLES.ADMIN && String(item.owner) !== String(requester.id)) {
    throw ApiError.forbidden('Not the owner of this item');
  }
  return item;
}

async function updateStatus(id, requesterId, status) {
  const item = await ReportItem.findById(id);
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

module.exports = { create, listForOwner, listAll, getOwned, updateStatus, remove };
