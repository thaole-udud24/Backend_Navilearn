const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const StudentSubjectItem = require('./student-subject.model');
const Concept = require('../knowledge/knowledge.model');

// Only a top-level Concept (no parent) stands in for "môn học" — picking a Chapter/Topic/Concept
// further down the tree would make "Khoá học của tôi" show chapters instead of subjects.
async function assertTopLevelConcept(conceptId) {
  const concept = await Concept.findOne({ _id: conceptId, status: 'active' });
  if (!concept) throw ApiError.badRequest('Concept not found', 'CONCEPT_NOT_FOUND');
  if (concept.parentConcept) {
    throw ApiError.badRequest(
      'Chỉ có thể chọn khái niệm gốc (môn học) — không phải chương/chủ đề con',
      'NOT_TOP_LEVEL_CONCEPT',
    );
  }
  return concept;
}

async function create(ownerId, data) {
  if (data.concept) {
    await assertTopLevelConcept(data.concept);
    const existing = await StudentSubjectItem.findOne({ owner: ownerId, concept: data.concept });
    if (existing) throw ApiError.conflict('Bạn đã thêm môn học này rồi', 'ALREADY_ADDED');
    return StudentSubjectItem.create({ owner: ownerId, createdBy: ownerId, concept: data.concept });
  }

  const existingCustom = await StudentSubjectItem.findOne({
    owner: ownerId,
    customTitle: new RegExp(`^${data.customTitle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'),
  });
  if (existingCustom) throw ApiError.conflict('Bạn đã có môn học cùng tên rồi', 'ALREADY_ADDED');
  return StudentSubjectItem.create({
    owner: ownerId,
    createdBy: ownerId,
    customTitle: data.customTitle,
    customDescription: data.customDescription,
    customColor: data.customColor,
  });
}

async function listForOwner(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { owner: ownerId };
  const [items, total] = await Promise.all([
    StudentSubjectItem.find(filter)
      .sort({ pinned: -1, displayOrder: 1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('concept', 'name description'),
    StudentSubjectItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getOwned(id, requester) {
  const item = await StudentSubjectItem.findById(id);
  if (!item) throw ApiError.notFound('Subject not found');
  if (String(item.owner) !== String(requester.id)) throw ApiError.forbidden('Not the owner of this subject');
  return item;
}

async function update(id, requester, data) {
  const item = await getOwned(id, requester);
  Object.assign(item, data, { updatedBy: requester.id });
  await item.save();
  return item;
}

async function remove(id, requester) {
  const item = await getOwned(id, requester);
  await item.softDelete();
}

module.exports = { create, listForOwner, getOwned, update, remove };
