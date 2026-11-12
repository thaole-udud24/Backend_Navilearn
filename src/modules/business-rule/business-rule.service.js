const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const BusinessRuleItem = require('./business-rule.model');
const Threshold = require('./threshold.model');
const { ROLES } = require('../../shared/roles');

// Defaults mirror mastery.service's prior hardcoded cut points (BR-05/BR-39); admin overrides via
// upsertThreshold persist in the Threshold collection and win once set.
const DEFAULT_THRESHOLDS = {
  'mastery.developing': 40,
  'mastery.proficient': 70,
  'mastery.mastered': 90,
};

async function create(ownerId, data) {
  return BusinessRuleItem.create({ owner: ownerId, createdBy: ownerId, ...data });
}

async function listForOwner(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { owner: ownerId, ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    BusinessRuleItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    BusinessRuleItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function listAll(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = query.status ? { status: query.status } : {};
  const [items, total] = await Promise.all([
    BusinessRuleItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    BusinessRuleItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getOwned(id, requester) {
  const item = await BusinessRuleItem.findById(id);
  if (!item) throw ApiError.notFound('Item not found');
  if (requester.role !== ROLES.ADMIN && String(item.owner) !== String(requester.id)) {
    throw ApiError.forbidden('Not the owner of this item');
  }
  return item;
}

async function updateStatus(id, requesterId, status) {
  const item = await BusinessRuleItem.findById(id);
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

// UC-BRL-10: merges configured overrides over the defaults so callers always get a complete map.
async function getThresholds() {
  const rows = await Threshold.find({ key: { $in: Object.keys(DEFAULT_THRESHOLDS) } });
  const overrides = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return { ...DEFAULT_THRESHOLDS, ...overrides };
}

async function upsertThreshold(key, value, adminId) {
  if (!(key in DEFAULT_THRESHOLDS)) throw ApiError.badRequest('Unknown threshold key', 'UNKNOWN_THRESHOLD');
  const item = await Threshold.findOneAndUpdate(
    { key },
    { $set: { value, updatedBy: adminId }, $setOnInsert: { key, createdBy: adminId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  return item;
}

module.exports = {
  create,
  listForOwner,
  listAll,
  getOwned,
  updateStatus,
  remove,
  getThresholds,
  upsertThreshold,
  DEFAULT_THRESHOLDS,
};
