const ApiError = require('../../utils/ApiError');
const PersonalConcept = require('./knowledge.personal.model');
const ConceptNote = require('./knowledge.note.model');
const Concept = require('./knowledge.model');
const StudentSubjectItem = require('../student-subject/student-subject.model');
const {
  LEVELS,
  MAX_DEPTH,
  MAX_NODES_PER_SUBJECT,
  levelForParent,
  findPrerequisiteCycle,
} = require('./knowledge.helpers');

const NAME_COLLATION = { locale: 'vi', strength: 2 };

const toPublicNode = (node, noteCount = 0) => ({
  id: node.id,
  subject: String(node.studentSubject),
  parentNode: node.parentNode ? String(node.parentNode) : null,
  level: node.level,
  name: node.name,
  description: node.description,
  order: node.order,
  status: node.status,
  examFocus: node.examFocus,
  prerequisites: node.prerequisites.map(String),
  source: node.source,
  noteCount,
  createdAt: node.createdAt,
  updatedAt: node.updatedAt,
});

/** The student's own course. 404 (never 403) when it belongs to someone else, so ids do not leak. */
async function getOwnedSubject(subjectId, ownerId) {
  const subject = await StudentSubjectItem.findOne({ _id: subjectId, owner: ownerId }).populate('concept', 'name');
  if (!subject) throw ApiError.notFound('Không tìm thấy môn học');
  return subject;
}

const subjectTitle = (subject) => subject.customTitle || subject.concept?.name || 'Môn học';

async function getOwnedNode(nodeId, ownerId) {
  const node = await PersonalConcept.findOne({ _id: nodeId, owner: ownerId });
  if (!node) throw ApiError.notFound('Không tìm thấy nút kiến thức');
  return node;
}

async function getNodeInSubject(nodeId, ownerId, subjectId, { requireActive = false } = {}) {
  const node = await PersonalConcept.findOne({ _id: nodeId, owner: ownerId, studentSubject: subjectId });
  if (!node) throw ApiError.badRequest('Không tìm thấy nút kiến thức cha trong môn học này', 'INVALID_PARENT');
  if (requireActive && node.status !== 'active') {
    throw ApiError.conflict('Nút cha đã ngừng sử dụng', 'PARENT_ARCHIVED');
  }
  return node;
}

async function assertNameFree(ownerId, subjectId, parentId, name, exceptId) {
  const filter = { owner: ownerId, studentSubject: subjectId, parentNode: parentId, name, status: 'active' };
  if (exceptId) filter._id = { $ne: exceptId };
  if (await PersonalConcept.findOne(filter).collation(NAME_COLLATION).select('_id')) {
    throw ApiError.conflict('Đã có nút cùng tên trong nhánh này', 'NODE_NAME_EXISTS');
  }
}

async function nextOrder(ownerId, subjectId, parentId) {
  const last = await PersonalConcept.findOne({ owner: ownerId, studentSubject: subjectId, parentNode: parentId })
    .sort({ order: -1 })
    .select('order');
  return last ? last.order + 1 : 0;
}

async function assertRoom(ownerId, subjectId, extra = 1) {
  const count = await PersonalConcept.countDocuments({ owner: ownerId, studentSubject: subjectId });
  if (count + extra > MAX_NODES_PER_SUBJECT) {
    throw ApiError.conflict(`Mỗi môn học tối đa ${MAX_NODES_PER_SUBJECT} nút kiến thức`, 'NODE_LIMIT_REACHED');
  }
}

/** True when starting from `starts` and following prerequisite edges can reach `target`. */
function reaches(edges, starts, target) {
  const stack = [...starts];
  const seen = new Set();
  while (stack.length) {
    const id = String(stack.pop());
    if (id === String(target)) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    (edges.get(id) || []).forEach((next) => stack.push(String(next)));
  }
  return false;
}

/** Validates a prerequisite list for a (new or existing) concept-level node and returns clean ids. */
async function resolvePrerequisites(ownerId, subjectId, node, ids) {
  const unique = [...new Set(ids.map(String))];
  if (unique.length === 0) return [];
  if (node.level !== LEVELS.CONCEPT) {
    throw ApiError.badRequest('Chỉ khái niệm mới có quan hệ tiên quyết', 'PREREQUISITE_NOT_ALLOWED');
  }
  if (node.id && unique.includes(String(node.id))) {
    throw ApiError.badRequest('Khái niệm không thể là tiên quyết của chính nó', 'SELF_RELATION');
  }
  const concepts = await PersonalConcept.find({
    owner: ownerId,
    studentSubject: subjectId,
    level: LEVELS.CONCEPT,
    status: 'active',
  }).select('prerequisites');
  const known = new Set(concepts.map((c) => String(c._id)));
  if (!unique.every((id) => known.has(id))) {
    throw ApiError.badRequest('Tiên quyết phải là khái niệm đang sử dụng của cùng môn học', 'INVALID_RELATION');
  }
  if (node.id) {
    const edges = new Map(concepts.map((c) => [String(c._id), c.prerequisites.map(String)]));
    if (reaches(edges, unique, node.id)) {
      throw ApiError.badRequest('Quan hệ tiên quyết tạo thành vòng lặp', 'PREREQUISITE_CYCLE');
    }
  }
  return unique;
}

async function subjectNodes(ownerId, subjectId) {
  return PersonalConcept.find({ owner: ownerId, studentSubject: subjectId }).sort({ order: 1, createdAt: 1 });
}

/** Ids of `rootId` and everything below it, from an already loaded list. */
function subtreeIds(nodes, rootId) {
  const byParent = new Map();
  nodes.forEach((n) => {
    const key = String(n.parentNode);
    byParent.set(key, [...(byParent.get(key) || []), n]);
  });
  const ids = [];
  const stack = [String(rootId)];
  while (stack.length) {
    const id = stack.pop();
    ids.push(id);
    (byParent.get(id) || []).forEach((child) => stack.push(String(child._id)));
  }
  return ids;
}

// ---------- reading (UC-KNW-01, 02, 05) ----------

async function getTree(subjectId, ownerId, { includeArchived = false, examFocus } = {}) {
  const subject = await getOwnedSubject(subjectId, ownerId);
  let nodes = await subjectNodes(ownerId, subject._id);
  if (!includeArchived) nodes = nodes.filter((n) => n.status === 'active');
  if (examFocus !== undefined) nodes = nodes.filter((n) => n.examFocus === examFocus);

  const counts = await ConceptNote.aggregate([
    { $match: { owner: subject.owner, personalConcept: { $in: nodes.map((n) => n._id) } } },
    { $group: { _id: '$personalConcept', count: { $sum: 1 } } },
  ]);
  const noteCounts = new Map(counts.map((c) => [String(c._id), c.count]));

  return {
    subject: { id: subject.id, title: subjectTitle(subject), conceptId: subject.concept ? String(subject.concept._id) : null },
    nodes: nodes.map((n) => toPublicNode(n, noteCounts.get(String(n._id)) || 0)),
  };
}

async function searchNodes(subjectId, ownerId, q, { includeArchived = false } = {}) {
  const subject = await getOwnedSubject(subjectId, ownerId);
  const all = await subjectNodes(ownerId, subject._id);
  const byId = new Map(all.map((n) => [String(n._id), n]));
  const needle = q.trim().toLowerCase();
  const pathOf = (node) => {
    const names = [];
    let cursor = node.parentNode ? byId.get(String(node.parentNode)) : null;
    while (cursor) {
      names.unshift(cursor.name);
      cursor = cursor.parentNode ? byId.get(String(cursor.parentNode)) : null;
    }
    return names;
  };
  return all
    .filter((n) => includeArchived || n.status === 'active')
    .filter((n) => n.name.toLowerCase().includes(needle) || n.description.toLowerCase().includes(needle))
    .map((n) => ({ ...toPublicNode(n), path: pathOf(n) }));
}

// ---------- editing (UC-KNW-04, 06, 07, 08, 09) ----------

async function createNode(subjectId, ownerId, data) {
  const subject = await getOwnedSubject(subjectId, ownerId);
  await assertRoom(ownerId, subject._id);

  const parent = data.parentNode ? await getNodeInSubject(data.parentNode, ownerId, subject._id, { requireActive: true }) : null;
  const level = levelForParent(parent?.level);
  if (!level) throw ApiError.badRequest('Khái niệm là cấp cuối, không thể có nút con', 'LEAF_LEVEL');
  await assertNameFree(ownerId, subject._id, parent ? parent._id : null, data.name);

  const prerequisites = await resolvePrerequisites(ownerId, subject._id, { level }, data.prerequisites || []);
  const node = await PersonalConcept.create({
    owner: ownerId,
    studentSubject: subject._id,
    parentNode: parent ? parent._id : null,
    level,
    name: data.name,
    description: data.description || '',
    order: data.order ?? (await nextOrder(ownerId, subject._id, parent ? parent._id : null)),
    examFocus: data.examFocus === true,
    prerequisites,
    createdBy: String(ownerId),
  });
  return toPublicNode(node);
}

async function updateNode(nodeId, ownerId, data) {
  const node = await getOwnedNode(nodeId, ownerId);
  if (node.status === 'archived') {
    throw ApiError.conflict('Nút đã ngừng sử dụng, hãy khôi phục trước khi chỉnh sửa', 'NODE_ARCHIVED');
  }

  const movingTo = data.parentNode === undefined ? undefined : data.parentNode;
  const moving = movingTo !== undefined && String(movingTo ?? '') !== String(node.parentNode ?? '');
  let nextParentId = node.parentNode;
  let nextLevel = node.level;

  if (moving) {
    if (await PersonalConcept.exists({ parentNode: node._id })) {
      throw ApiError.conflict('Chỉ chuyển được nút chưa có nút con', 'NODE_HAS_CHILDREN');
    }
    const parent = movingTo ? await getNodeInSubject(movingTo, ownerId, node.studentSubject, { requireActive: true }) : null;
    nextLevel = levelForParent(parent?.level);
    if (!nextLevel) throw ApiError.badRequest('Khái niệm là cấp cuối, không thể có nút con', 'LEAF_LEVEL');
    if (nextLevel !== node.level && (await PersonalConcept.exists({ prerequisites: node._id }))) {
      throw ApiError.conflict('Nút đang là tiên quyết của khái niệm khác, không thể đổi cấp', 'NODE_IS_PREREQUISITE');
    }
    nextParentId = parent ? parent._id : null;
  }

  const nextName = data.name ?? node.name;
  if (moving || (data.name !== undefined && data.name !== node.name)) {
    await assertNameFree(ownerId, node.studentSubject, nextParentId, nextName, node._id);
  }

  const levelNode = { id: node.id, level: nextLevel };
  if (data.prerequisites !== undefined) {
    node.prerequisites = await resolvePrerequisites(ownerId, node.studentSubject, levelNode, data.prerequisites);
  } else if (nextLevel !== LEVELS.CONCEPT && node.prerequisites.length) {
    throw ApiError.badRequest('Hãy bỏ quan hệ tiên quyết trước khi chuyển nút khỏi cấp khái niệm', 'PREREQUISITE_NOT_ALLOWED');
  }

  node.parentNode = nextParentId;
  node.level = nextLevel;
  node.name = nextName;
  if (data.description !== undefined) node.description = data.description;
  if (data.examFocus !== undefined) node.examFocus = data.examFocus;
  if (data.order !== undefined) node.order = data.order;
  node.updatedBy = String(ownerId);
  await node.save();
  return toPublicNode(node);
}

// UC-KNW-09: archiving a node archives everything below it.
async function archiveNode(nodeId, ownerId) {
  const node = await getOwnedNode(nodeId, ownerId);
  if (node.status === 'archived') throw ApiError.conflict('Nút đã ngừng sử dụng', 'NODE_ARCHIVED');
  const ids = subtreeIds(await subjectNodes(ownerId, node.studentSubject), node._id);
  await PersonalConcept.updateMany({ _id: { $in: ids } }, { $set: { status: 'archived', updatedBy: String(ownerId) } });
  return { archivedCount: ids.length };
}

async function restoreNode(nodeId, ownerId) {
  const node = await getOwnedNode(nodeId, ownerId);
  if (node.status === 'active') throw ApiError.conflict('Nút đang được sử dụng', 'NODE_NOT_ARCHIVED');
  if (node.parentNode) {
    const parent = await PersonalConcept.findById(node.parentNode).select('status');
    if (!parent || parent.status !== 'active') {
      throw ApiError.conflict('Hãy khôi phục nút cha trước', 'PARENT_ARCHIVED');
    }
  }
  const ids = subtreeIds(await subjectNodes(ownerId, node.studentSubject), node._id);
  await PersonalConcept.updateMany({ _id: { $in: ids } }, { $set: { status: 'active', updatedBy: String(ownerId) } });
  return { restoredCount: ids.length };
}

// ---------- applying a sample structure (UC-KNW-03) ----------

/**
 * Copies a shared Concept tree (subject root -> chapter -> topic -> concept) into the student's own
 * structure. Existing nodes with the same name in the same place are reused, so applying twice is safe.
 * Concepts deeper than three levels are skipped and counted.
 */
async function applyTemplate(subjectId, ownerId, conceptId) {
  const subject = await getOwnedSubject(subjectId, ownerId);
  const rootId = conceptId || (subject.concept ? subject.concept._id : null);
  if (!rootId) {
    throw ApiError.badRequest('Môn tự tạo chưa gắn cấu trúc mẫu, hãy chọn một cấu trúc mẫu', 'TEMPLATE_REQUIRED');
  }
  const root = await Concept.findOne({ _id: rootId, parentConcept: null, status: 'active' });
  if (!root) throw ApiError.notFound('Không tìm thấy cấu trúc mẫu');

  const levels = [];
  let frontier = [root._id];
  for (let depth = 1; depth <= MAX_DEPTH; depth += 1) {
    // eslint-disable-next-line no-await-in-loop
    const children = await Concept.find({ parentConcept: { $in: frontier }, status: 'active' }).sort({ order: 1, createdAt: 1 });
    levels.push(children);
    frontier = children.map((c) => c._id);
    if (!frontier.length) break;
  }
  const skipped = frontier.length ? await Concept.countDocuments({ parentConcept: { $in: frontier }, status: 'active' }) : 0;

  const existing = await subjectNodes(ownerId, subject._id);
  const total = levels.reduce((sum, l) => sum + l.length, 0);
  await assertRoom(ownerId, subject._id, 0);
  if (existing.length + total > MAX_NODES_PER_SUBJECT) {
    throw ApiError.conflict(`Cấu trúc mẫu vượt quá giới hạn ${MAX_NODES_PER_SUBJECT} nút của môn học`, 'NODE_LIMIT_REACHED');
  }

  const keyOf = (parent, name) => `${parent ?? 'root'}|${name.trim().toLowerCase()}`;
  const index = new Map(existing.filter((n) => n.status === 'active').map((n) => [keyOf(n.parentNode, n.name), n]));
  const mapped = new Map(); // shared concept id -> personal node
  const createdNodes = [];
  let reused = 0;

  for (let i = 0; i < levels.length; i += 1) {
    const level = [LEVELS.CHAPTER, LEVELS.TOPIC, LEVELS.CONCEPT][i];
    for (const source of levels[i]) {
      const parent = i === 0 ? null : mapped.get(String(source.parentConcept));
      if (i > 0 && !parent) continue; // parent was skipped
      const key = keyOf(parent ? parent._id : null, source.name);
      const found = index.get(key);
      if (found) {
        mapped.set(String(source._id), found);
        reused += 1;
        continue;
      }
      // eslint-disable-next-line no-await-in-loop
      const node = await PersonalConcept.create({
        owner: ownerId,
        studentSubject: subject._id,
        parentNode: parent ? parent._id : null,
        level,
        name: source.name,
        description: source.description || '',
        order: source.order ?? 0,
        source: 'template',
        sourceConcept: source._id,
        createdBy: String(ownerId),
      });
      mapped.set(String(source._id), node);
      index.set(key, node);
      createdNodes.push({ node, source });
    }
  }

  // Prerequisites are copied only between nodes that exist in the copy, and only if they form no cycle.
  const edges = new Map();
  createdNodes.forEach(({ node, source }) => {
    if (node.level !== LEVELS.CONCEPT) return;
    const targets = source.prerequisites
      .map((p) => mapped.get(String(p)))
      .filter((p) => p && p.level === LEVELS.CONCEPT && String(p._id) !== String(node._id));
    if (targets.length) edges.set(String(node._id), targets.map((p) => String(p._id)));
  });
  const hasCycle = findPrerequisiteCycle(edges).length > 0;
  let prerequisitesCopied = 0;
  if (!hasCycle) {
    for (const [nodeId, targets] of edges) {
      // eslint-disable-next-line no-await-in-loop
      await PersonalConcept.updateOne({ _id: nodeId }, { $set: { prerequisites: targets } });
      prerequisitesCopied += targets.length;
    }
  }

  return { created: createdNodes.length, reused, skipped, prerequisitesCopied, prerequisitesSkippedForCycle: hasCycle };
}

module.exports = {
  toPublicNode,
  getOwnedSubject,
  getOwnedNode,
  subjectTitle,
  subjectNodes,
  nextOrder,
  assertRoom,
  assertNameFree,
  getTree,
  searchNodes,
  createNode,
  updateNode,
  archiveNode,
  restoreNode,
  applyTemplate,
};
