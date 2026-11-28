const ApiError = require('../../utils/ApiError');
const Concept = require('./knowledge.model');
const { analyzeStructure } = require('./knowledge.helpers');

// Admin tools for the shared sample structures: a top-level Concept (parentConcept = null) is a
// "môn học" and everything below it is the sample structure students can apply to their own course.

async function getRoot(rootId) {
  const root = await Concept.findOne({ _id: rootId, parentConcept: null });
  if (!root) throw ApiError.notFound('Không tìm thấy cấu trúc mẫu (môn học gốc)');
  return root;
}

/** Descendants of `rootId` (any status), loaded level by level. */
async function loadDescendants(rootId, { activeOnly = false } = {}) {
  const all = [];
  let frontier = [rootId];
  const seen = new Set([String(rootId)]);
  while (frontier.length) {
    const filter = { parentConcept: { $in: frontier } };
    if (activeOnly) filter.status = 'active';
    // eslint-disable-next-line no-await-in-loop
    const children = await Concept.find(filter).sort({ order: 1, createdAt: 1 });
    const fresh = children.filter((c) => !seen.has(String(c._id)));
    fresh.forEach((c) => seen.add(String(c._id)));
    all.push(...fresh);
    frontier = fresh.map((c) => c._id);
  }
  return all;
}

// UC-KNW-22
async function validateStructure(rootId) {
  const root = await getRoot(rootId);
  const nodes = await loadDescendants(root._id);
  return analyzeStructure(
    root._id,
    nodes.map((n) => ({
      id: n._id,
      parent: n.parentConcept,
      name: n.name,
      status: n.status,
      prerequisites: n.prerequisites,
    })),
  );
}

// UC-KNW-17: copies the active part of a structure under a new top-level concept.
async function copyStructure(adminId, rootId, { name } = {}) {
  const root = await getRoot(rootId);
  const nodes = await loadDescendants(root._id, { activeOnly: true });
  const newName = (name || `${root.name} (bản sao)`).trim();
  if (await Concept.findOne({ parentConcept: null, name: newName }).collation({ locale: 'vi', strength: 2 }).select('_id')) {
    throw ApiError.conflict('Đã có môn học gốc cùng tên', 'NAME_EXISTS');
  }

  const copy = await Concept.create({
    owner: adminId,
    name: newName,
    description: root.description,
    order: root.order,
    parentConcept: null,
    createdBy: String(adminId),
  });

  const idMap = new Map([[String(root._id), copy._id]]);
  const created = [copy];
  // Parents are always created before their children because `nodes` is in breadth-first order.
  for (const node of nodes) {
    // eslint-disable-next-line no-await-in-loop
    const clone = await Concept.create({
      owner: adminId,
      name: node.name,
      description: node.description,
      order: node.order,
      parentConcept: idMap.get(String(node.parentConcept)),
      createdBy: String(adminId),
    });
    idMap.set(String(node._id), clone._id);
    created.push(clone);
  }

  // Relations are kept only between nodes inside the copied structure; links to other subjects are dropped.
  let relationsCopied = 0;
  let relationsDropped = 0;
  for (const node of nodes) {
    const remap = (ids) => ids.filter((id) => idMap.has(String(id))).map((id) => idMap.get(String(id)));
    const prerequisites = remap(node.prerequisites);
    const related = remap(node.related);
    relationsCopied += prerequisites.length + related.length;
    relationsDropped += node.prerequisites.length + node.related.length - prerequisites.length - related.length;
    if (prerequisites.length || related.length) {
      // eslint-disable-next-line no-await-in-loop
      await Concept.updateOne({ _id: idMap.get(String(node._id)) }, { $set: { prerequisites, related } });
    }
  }

  return { rootId: String(copy._id), name: copy.name, nodeCount: created.length - 1, relationsCopied, relationsDropped };
}

// UC-KNW-19 (and restoring it): switches a whole structure, root included, between active and archived.
async function setStructureStatus(adminId, rootId, status) {
  const root = await getRoot(rootId);
  const nodes = await loadDescendants(root._id);
  const ids = [root._id, ...nodes.map((n) => n._id)];
  const { modifiedCount } = await Concept.updateMany(
    { _id: { $in: ids }, status: { $ne: status } },
    { $set: { status, updatedBy: String(adminId) } },
  );
  return { rootId: String(root._id), status, changedCount: modifiedCount };
}

module.exports = { validateStructure, copyStructure, setStructureStatus };
