// Pure helpers for the knowledge module (no database): level rules, AI proposal parsing, structure analysis.

// Subject (the student's course) -> chapter -> topic -> concept. The subject itself is not a node.
const LEVELS = Object.freeze({ CHAPTER: 'chapter', TOPIC: 'topic', CONCEPT: 'concept' });
const LEVEL_ORDER = [LEVELS.CHAPTER, LEVELS.TOPIC, LEVELS.CONCEPT];
const MAX_DEPTH = LEVEL_ORDER.length;

const MAX_NODES_PER_SUBJECT = 500;
const MAX_PROPOSAL_NODES = 60;

/** Level of a new child given its parent's level (null parent = top level). Returns null if impossible. */
function levelForParent(parentLevel) {
  if (!parentLevel) return LEVELS.CHAPTER;
  const index = LEVEL_ORDER.indexOf(parentLevel);
  return index === -1 || index === LEVEL_ORDER.length - 1 ? null : LEVEL_ORDER[index + 1];
}

const sameName = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

// ---------- AI proposal text ----------
// Expected lines (case-insensitive), in tree order:
//   CHAPTER: <name>
//   TOPIC: <name>
//   CONCEPT: <name> | <short description>
const PROPOSAL_LINE = /^(CHAPTER|TOPIC|CONCEPT)\s*:\s*(.+)$/i;

/**
 * Turns the AI's text into a flat node list with temporary refs.
 * Lines that break the hierarchy (a TOPIC before any CHAPTER, ...) are skipped and counted.
 */
function parseProposalText(raw) {
  const nodes = [];
  let skipped = 0;
  let chapter = null;
  let topic = null;

  String(raw || '')
    .split('\n')
    .map((line) => line.trim().replace(/^[-*\d.\s]+(?=(CHAPTER|TOPIC|CONCEPT)\s*:)/i, ''))
    .forEach((line) => {
      const match = line.match(PROPOSAL_LINE);
      if (!match) return;
      const level = match[1].toLowerCase();
      const [name, ...rest] = match[2].split('|');
      const cleanName = name.trim().slice(0, 200);
      if (!cleanName) return;
      const description = rest.join('|').trim().slice(0, 2000);
      const ref = `n${nodes.length + 1}`;

      if (level === LEVELS.CHAPTER) {
        chapter = ref;
        topic = null;
        nodes.push({ ref, parentRef: null, level, name: cleanName, description });
      } else if (level === LEVELS.TOPIC) {
        if (!chapter) return void (skipped += 1);
        topic = ref;
        nodes.push({ ref, parentRef: chapter, level, name: cleanName, description });
      } else {
        if (!topic) return void (skipped += 1);
        nodes.push({ ref, parentRef: topic, level, name: cleanName, description });
      }
    });

  return { nodes: nodes.slice(0, MAX_PROPOSAL_NODES), skipped };
}

// ---------- structure validation (shared knowledge tree) ----------

/** Detects a cycle in a prerequisite graph given as Map(id -> ids[]). Returns the ids on a cycle, or []. */
function findPrerequisiteCycle(edges) {
  const WHITE = 0;
  const GREY = 1;
  const BLACK = 2;
  const color = new Map();
  const stack = [];

  const visit = (id) => {
    color.set(id, GREY);
    stack.push(id);
    for (const next of edges.get(id) || []) {
      if (color.get(next) === GREY) return [...stack.slice(stack.indexOf(next)), next];
      if ((color.get(next) || WHITE) === WHITE && edges.has(next)) {
        const cycle = visit(next);
        if (cycle.length) return cycle;
      }
    }
    stack.pop();
    color.set(id, BLACK);
    return [];
  };

  for (const id of edges.keys()) {
    if ((color.get(id) || WHITE) === WHITE) {
      const cycle = visit(id);
      if (cycle.length) return cycle;
    }
  }
  return [];
}

/**
 * Checks a subject's subtree. `nodes` are the descendants of the root (not the root itself):
 * { id, parent, name, status, prerequisites: [id] } where parent === rootId for chapters.
 */
function analyzeStructure(rootId, nodes) {
  const errors = [];
  const warnings = [];
  const byId = new Map(nodes.map((n) => [String(n.id), n]));
  const children = new Map();
  nodes.forEach((n) => {
    const key = String(n.parent);
    children.set(key, [...(children.get(key) || []), n]);
  });

  const depthOf = (node) => {
    let depth = 1;
    let cursor = byId.get(String(node.parent));
    while (cursor) {
      depth += 1;
      cursor = byId.get(String(cursor.parent));
    }
    return depth;
  };

  if (nodes.length === 0) errors.push({ code: 'EMPTY_STRUCTURE', message: 'Cấu trúc chưa có chương, chủ đề hay khái niệm nào' });

  // Duplicate sibling names among active nodes.
  children.forEach((siblings) => {
    const seen = new Map();
    siblings
      .filter((n) => n.status === 'active')
      .forEach((n) => {
        const key = n.name.trim().toLowerCase();
        if (seen.has(key)) {
          errors.push({ code: 'DUPLICATE_NAME', nodeId: String(n.id), message: `Trùng tên "${n.name}" trong cùng một nhánh` });
        }
        seen.set(key, true);
      });
  });

  const edges = new Map();
  nodes.forEach((node) => {
    const depth = depthOf(node);
    const isLeaf = !(children.get(String(node.id)) || []).some((c) => c.status === 'active');
    const stats = { depth, isLeaf };
    node._stats = stats; // eslint-disable-line no-param-reassign

    if (depth > MAX_DEPTH) {
      errors.push({ code: 'TOO_DEEP', nodeId: String(node.id), message: `"${node.name}" nằm sâu quá ${MAX_DEPTH} cấp (chương > chủ đề > khái niệm)` });
    }
    if (node.status === 'active' && depth < MAX_DEPTH && isLeaf) {
      warnings.push({ code: 'SHALLOW_BRANCH', nodeId: String(node.id), message: `"${node.name}" chưa có nút con (nhánh chưa đến cấp khái niệm)` });
    }
    const prereqs = (node.prerequisites || []).map(String);
    if (prereqs.length && !isLeaf) {
      warnings.push({ code: 'CONTAINER_PREREQUISITE', nodeId: String(node.id), message: `"${node.name}" là chương/chủ đề nhưng có quan hệ tiên quyết` });
    }
    prereqs.forEach((pid) => {
      const target = byId.get(pid);
      if (!target) {
        warnings.push({ code: 'EXTERNAL_PREREQUISITE', nodeId: String(node.id), message: `"${node.name}" có tiên quyết nằm ngoài cấu trúc này` });
      } else if (target.status !== 'active' && node.status === 'active') {
        errors.push({ code: 'ARCHIVED_PREREQUISITE', nodeId: String(node.id), message: `"${node.name}" có tiên quyết "${target.name}" đã ngừng sử dụng` });
      }
    });
    edges.set(String(node.id), prereqs.filter((pid) => byId.has(pid)));
  });

  const cycle = findPrerequisiteCycle(edges);
  if (cycle.length) {
    errors.push({
      code: 'PREREQUISITE_CYCLE',
      message: `Quan hệ tiên quyết tạo vòng lặp: ${cycle.map((id) => byId.get(id)?.name ?? id).join(' → ')}`,
    });
  }

  const active = nodes.filter((n) => n.status === 'active');
  const countAt = (depth) => active.filter((n) => n._stats.depth === depth).length;
  const stats = { chapters: countAt(1), topics: countAt(2), concepts: countAt(3), total: active.length };
  nodes.forEach((n) => delete n._stats); // eslint-disable-line no-param-reassign

  return { rootId: String(rootId), valid: errors.length === 0, errors, warnings, stats };
}

module.exports = {
  LEVELS,
  LEVEL_ORDER,
  MAX_DEPTH,
  MAX_NODES_PER_SUBJECT,
  MAX_PROPOSAL_NODES,
  levelForParent,
  sameName,
  parseProposalText,
  findPrerequisiteCycle,
  analyzeStructure,
};
