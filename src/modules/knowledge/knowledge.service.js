const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const importBulk = require('../../utils/importBulk');
const Concept = require('./knowledge.model');
const { ROLES } = require('../../shared/roles');
const { createSchema } = require('./knowledge.validation');

// A concept cannot relate to itself, and the hierarchy (parent) must stay a tree — never a cycle a
// tree-rendering UI could spin on forever. Academic relations (prerequisites/related) are checked
// for existence only: they're a DAG across the whole bank, not just this concept's own subtree.
async function assertConceptsExist(ids) {
  if (!ids || !ids.length) return;
  const unique = [...new Set(ids.map(String))];
  const count = await Concept.countDocuments({ _id: { $in: unique } });
  if (count !== unique.length)
    throw ApiError.badRequest('Một hoặc nhiều kiến thức liên quan không tồn tại', 'INVALID_RELATION');
}

async function assertNoParentCycle(id, parentId) {
  let cursor = parentId;
  const seen = new Set();
  while (cursor) {
    if (String(cursor) === String(id))
      throw ApiError.badRequest('Quan hệ cha-con tạo thành vòng lặp', 'PARENT_CYCLE');
    if (seen.has(String(cursor))) break;
    seen.add(String(cursor));
    const node = await Concept.findById(cursor).select('parentConcept');
    cursor = node ? node.parentConcept : null;
  }
}

async function validateRelations(id, data) {
  if (data.parentConcept !== undefined && data.parentConcept !== null) {
    if (id && String(data.parentConcept) === String(id)) {
      throw ApiError.badRequest('Kiến thức không thể là cha của chính nó', 'SELF_PARENT');
    }
    const parentConcept = await Concept.findById(data.parentConcept);
    if (!parentConcept) throw ApiError.badRequest('Không tìm thấy kiến thức cha', 'INVALID_RELATION');
    if (id) await assertNoParentCycle(id, data.parentConcept);
  }
  if (data.prerequisites) {
    if (id && data.prerequisites.some((p) => String(p) === String(id))) {
      throw ApiError.badRequest('Kiến thức không thể là tiên quyết của chính nó', 'SELF_RELATION');
    }
    await assertConceptsExist(data.prerequisites);
  }
  if (data.related) {
    if (id && data.related.some((p) => String(p) === String(id))) {
      throw ApiError.badRequest('Kiến thức không thể liên quan tới chính nó', 'SELF_RELATION');
    }
    await assertConceptsExist(data.related);
  }
}

async function create(ownerId, data) {
  await validateRelations(null, data);
  return Concept.create({ owner: ownerId, createdBy: ownerId, ...data });
}

// Concepts are shared content: every authenticated user sees the same list (students default to active only).
async function list(query, requester) {
  const { page, limit, skip } = parsePagination(query);
  // Non-admins are always forced to 'active', ignoring any status they ask for — only admins may
  // pass their own status filter (or none, to see every status).
  const filter =
    requester.role === ROLES.ADMIN ? (query.status ? { status: query.status } : {}) : { status: 'active' };
  const [items, total] = await Promise.all([
    Concept.find(filter)
      .sort({ order: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('parentConcept', 'name'),
    Concept.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const item = await Concept.findById(id)
    .populate('parentConcept', 'name')
    .populate('prerequisites', 'name')
    .populate('related', 'name');
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

async function update(id, requesterId, data) {
  await validateRelations(id, data);
  const item = await getById(id);
  Object.assign(item, data, { updatedBy: requesterId });
  await item.save();
  return item;
}

async function remove(id) {
  const item = await getById(id);
  // Soft-deleting a concept other concepts still point to would silently null out their relation
  // on the next read, so refuse instead of leaving the tree/graph with a dangling reference.
  const referencedBy = await Concept.countDocuments({
    $or: [{ parentConcept: id }, { prerequisites: id }, { related: id }],
  });
  if (referencedBy > 0) {
    throw ApiError.conflict(
      'Không thể xoá: còn kiến thức khác đang tham chiếu tới mục này (quan hệ cha-con hoặc tiên quyết/liên quan)',
    );
  }
  await item.softDelete();
}

async function importBulkConcepts(ownerId, rows) {
  // Provenance is set by the import pipeline itself, not whatever a row happens to claim.
  return importBulk(rows, {
    schema: createSchema,
    create: (data) => create(ownerId, { ...data, source: 'import' }),
  });
}

async function exportAll() {
  return Concept.find({}).sort({ order: 1, createdAt: -1 }).limit(1000);
}

module.exports = {
  create,
  list,
  getById,
  update,
  updateStatus,
  remove,
  importBulk: importBulkConcepts,
  exportAll,
};
