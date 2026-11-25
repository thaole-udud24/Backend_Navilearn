const {
  levelForParent,
  parseProposalText,
  findPrerequisiteCycle,
  analyzeStructure,
} = require('./knowledge.helpers');

describe('levelForParent', () => {
  it('maps chapter -> topic -> concept and stops at concept', () => {
    expect(levelForParent(null)).toBe('chapter');
    expect(levelForParent('chapter')).toBe('topic');
    expect(levelForParent('topic')).toBe('concept');
    expect(levelForParent('concept')).toBeNull();
  });
});

describe('parseProposalText', () => {
  it('builds a tree with parent refs and descriptions', () => {
    const { nodes, skipped } = parseProposalText(
      ['CHAPTER: Giới hạn', 'TOPIC: Giới hạn hàm số', 'CONCEPT: Giới hạn một phía | Giới hạn trái và phải', 'TOPIC: Liên tục', 'CHAPTER: Đạo hàm'].join('\n'),
    );
    expect(skipped).toBe(0);
    expect(nodes.map((n) => [n.level, n.name, n.parentRef])).toEqual([
      ['chapter', 'Giới hạn', null],
      ['topic', 'Giới hạn hàm số', 'n1'],
      ['concept', 'Giới hạn một phía', 'n2'],
      ['topic', 'Liên tục', 'n1'],
      ['chapter', 'Đạo hàm', null],
    ]);
    expect(nodes[2].description).toBe('Giới hạn trái và phải');
  });

  it('tolerates bullets/numbering and lower case, ignores chatter', () => {
    const { nodes } = parseProposalText('Đây là đề xuất:\n- chapter: A\n1. TOPIC: B\n* Concept: C | mô tả');
    expect(nodes.map((n) => n.name)).toEqual(['A', 'B', 'C']);
  });

  it('skips lines that break the hierarchy', () => {
    const { nodes, skipped } = parseProposalText('TOPIC: orphan\nCONCEPT: orphan2\nCHAPTER: A\nCONCEPT: no topic yet');
    expect(nodes.map((n) => n.name)).toEqual(['A']);
    expect(skipped).toBe(3);
  });

  it('returns nothing for text without the format', () => {
    expect(parseProposalText('AI stub response for: x').nodes).toEqual([]);
    expect(parseProposalText('').nodes).toEqual([]);
  });

  it('caps the number of nodes', () => {
    const text = Array.from({ length: 100 }, (_, i) => `CHAPTER: C${i}`).join('\n');
    expect(parseProposalText(text).nodes).toHaveLength(60);
  });
});

describe('findPrerequisiteCycle', () => {
  it('finds a cycle and returns its path', () => {
    const cycle = findPrerequisiteCycle(new Map([['a', ['b']], ['b', ['c']], ['c', ['a']]]));
    expect(cycle).toEqual(['a', 'b', 'c', 'a']);
  });

  it('returns nothing for a DAG with a shared dependency', () => {
    const edges = new Map([['a', ['b', 'c']], ['b', ['d']], ['c', ['d']], ['d', []]]);
    expect(findPrerequisiteCycle(edges)).toEqual([]);
  });
});

describe('analyzeStructure', () => {
  const node = (id, parent, name, extra = {}) => ({ id, parent, name, status: 'active', prerequisites: [], ...extra });

  it('accepts a clean three-level structure and counts it', () => {
    const report = analyzeStructure('root', [
      node('c1', 'root', 'Chương 1'),
      node('t1', 'c1', 'Chủ đề 1'),
      node('k1', 't1', 'Khái niệm 1'),
      node('k2', 't1', 'Khái niệm 2', { prerequisites: ['k1'] }),
    ]);
    expect(report.valid).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.stats).toEqual({ chapters: 1, topics: 1, concepts: 2, total: 4 });
  });

  it('flags an empty structure', () => {
    const report = analyzeStructure('root', []);
    expect(report.valid).toBe(false);
    expect(report.errors[0].code).toBe('EMPTY_STRUCTURE');
  });

  it('flags duplicate sibling names (case-insensitive) but not the same name elsewhere', () => {
    const report = analyzeStructure('root', [
      node('c1', 'root', 'Giới hạn'),
      node('c2', 'root', 'giới hạn'),
      node('t1', 'c1', 'Chung'),
      node('t2', 'c2', 'Chung'),
      node('k1', 't1', 'K'),
      node('k2', 't2', 'K'),
    ]);
    expect(report.errors.filter((e) => e.code === 'DUPLICATE_NAME')).toHaveLength(1);
  });

  it('flags nodes deeper than three levels', () => {
    const report = analyzeStructure('root', [
      node('c1', 'root', 'A'),
      node('t1', 'c1', 'B'),
      node('k1', 't1', 'C'),
      node('x1', 'k1', 'D'),
    ]);
    expect(report.errors.map((e) => e.code)).toContain('TOO_DEEP');
  });

  it('flags a prerequisite cycle and an archived prerequisite', () => {
    const report = analyzeStructure('root', [
      node('c1', 'root', 'A'),
      node('t1', 'c1', 'B'),
      node('k1', 't1', 'K1', { prerequisites: ['k2'] }),
      node('k2', 't1', 'K2', { prerequisites: ['k1'] }),
      node('k3', 't1', 'K3', { prerequisites: ['k4'] }),
      node('k4', 't1', 'K4', { status: 'archived' }),
    ]);
    const codes = report.errors.map((e) => e.code);
    expect(codes).toContain('PREREQUISITE_CYCLE');
    expect(codes).toContain('ARCHIVED_PREREQUISITE');
    expect(report.valid).toBe(false);
  });

  it('warns (does not fail) about shallow branches and prerequisites outside the structure', () => {
    const report = analyzeStructure('root', [
      node('c1', 'root', 'A'),
      node('t1', 'c1', 'B'),
      node('k1', 't1', 'K1', { prerequisites: ['somewhere-else'] }),
      node('c2', 'root', 'Chương rỗng'),
    ]);
    expect(report.valid).toBe(true);
    const codes = report.warnings.map((w) => w.code);
    expect(codes).toContain('SHALLOW_BRANCH');
    expect(codes).toContain('EXTERNAL_PREREQUISITE');
  });
});
