const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const Subject = require('./subject.model');
const SubjectDocument = require('./subject.document.model');
const { removeStoredFile } = require('./subject.upload');
const { SUBJECT_SCOPE, SUBJECT_STATUS } = require('./subject.constants');
const { escapeRegex, toPublicSubject, countDocumentsBySubject } = require('./subject.helpers');

// Case-insensitive match so "Toán" and "toán" count as the same name.
const NAME_COLLATION = { locale: 'vi', strength: 2 };

/** Loads a personal subject of this student. 404 (not 403) when it is someone else's, so ids do not leak. */
async function getOwnedSubject(subjectId, ownerId, { requireActive = false } = {}) {
  const subject = await Subject.findOne({ _id: subjectId, scope: SUBJECT_SCOPE.PERSONAL, owner: ownerId });
  if (!subject) throw ApiError.notFound('Không tìm thấy môn học');
  if (requireActive && subject.status !== SUBJECT_STATUS.ACTIVE) {
    throw ApiError.conflict('Môn học đã lưu trữ, hãy khôi phục trước khi thay đổi', 'SUBJECT_ARCHIVED');
  }
  return subject;
}

async function assertNameFree(ownerId, name, exceptId) {
  const filter = { scope: SUBJECT_SCOPE.PERSONAL, owner: ownerId, name };
  if (exceptId) filter._id = { $ne: exceptId };
  const exists = await Subject.findOne(filter).collation(NAME_COLLATION).select('_id');
  if (exists) throw ApiError.conflict('Bạn đã có môn học trùng tên', 'SUBJECT_NAME_EXISTS');
}

async function nextOrder(ownerId) {
  const last = await Subject.findOne({ scope: SUBJECT_SCOPE.PERSONAL, owner: ownerId }).sort({ order: -1 }).select('order');
  return last ? last.order + 1 : 0;
}

async function withCounts(subjects) {
  const counts = await countDocumentsBySubject(SubjectDocument, subjects.map((s) => s._id));
  return subjects.map((s) => toPublicSubject(s, counts.get(String(s._id)) || 0));
}

// UC-SUB-01
async function list(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {
    scope: SUBJECT_SCOPE.PERSONAL,
    owner: ownerId,
    status: query.status || SUBJECT_STATUS.ACTIVE,
  };
  if (query.q) filter.name = { $regex: escapeRegex(query.q), $options: 'i' };
  const [subjects, total] = await Promise.all([
    Subject.find(filter).sort({ pinned: -1, order: 1, createdAt: -1 }).skip(skip).limit(limit),
    Subject.countDocuments(filter),
  ]);
  return { items: await withCounts(subjects), meta: buildMeta(page, limit, total) };
}

async function get(subjectId, ownerId) {
  const subject = await getOwnedSubject(subjectId, ownerId);
  return (await withCounts([subject]))[0];
}

// UC-SUB-02
async function create(ownerId, data) {
  await assertNameFree(ownerId, data.name);
  const subject = await Subject.create({
    scope: SUBJECT_SCOPE.PERSONAL,
    owner: ownerId,
    name: data.name,
    description: data.description || '',
    order: await nextOrder(ownerId),
    createdBy: ownerId,
  });
  return toPublicSubject(subject);
}

// UC-SUB-03: copy a catalog entry into the student's own space.
async function createFromCatalog(ownerId, catalogSubjectId) {
  const catalog = await Subject.findOne({
    _id: catalogSubjectId,
    scope: SUBJECT_SCOPE.SHARED,
    status: SUBJECT_STATUS.ACTIVE,
  });
  if (!catalog) throw ApiError.notFound('Môn học không có trong danh mục chung hoặc đã ngừng sử dụng');
  if (await Subject.exists({ scope: SUBJECT_SCOPE.PERSONAL, owner: ownerId, catalogSubject: catalog._id })) {
    throw ApiError.conflict('Bạn đã chọn môn học này', 'SUBJECT_ALREADY_ADDED');
  }
  await assertNameFree(ownerId, catalog.name);
  const subject = await Subject.create({
    scope: SUBJECT_SCOPE.PERSONAL,
    owner: ownerId,
    name: catalog.name,
    description: catalog.description,
    catalogSubject: catalog._id,
    order: await nextOrder(ownerId),
    createdBy: ownerId,
  });
  return toPublicSubject(subject);
}

// UC-SUB-04
async function update(subjectId, ownerId, data) {
  const subject = await getOwnedSubject(subjectId, ownerId, { requireActive: true });
  if (data.name !== undefined && data.name !== subject.name) {
    await assertNameFree(ownerId, data.name, subject._id);
    subject.name = data.name;
  }
  if (data.description !== undefined) subject.description = data.description;
  subject.updatedBy = ownerId;
  await subject.save();
  return (await withCounts([subject]))[0];
}

// UC-SUB-05 (pin)
async function setPinned(subjectId, ownerId, pinned) {
  const subject = await getOwnedSubject(subjectId, ownerId, { requireActive: true });
  subject.pinned = pinned;
  subject.updatedBy = ownerId;
  await subject.save();
  return (await withCounts([subject]))[0];
}

// UC-SUB-05 (order): `ids` is the new order of the student's active subjects (a subset is allowed).
async function reorder(ownerId, ids) {
  const unique = [...new Set(ids)];
  const owned = await Subject.find({
    _id: { $in: unique },
    scope: SUBJECT_SCOPE.PERSONAL,
    owner: ownerId,
    status: SUBJECT_STATUS.ACTIVE,
  }).select('_id');
  if (owned.length !== unique.length) throw ApiError.badRequest('Danh sách môn học không hợp lệ', 'INVALID_SUBJECT_IDS');
  await Subject.bulkWrite(
    unique.map((id, index) => ({
      updateOne: { filter: { _id: id, owner: ownerId }, update: { $set: { order: index } } },
    })),
  );
}

// UC-SUB-08
async function archive(subjectId, ownerId) {
  const subject = await getOwnedSubject(subjectId, ownerId);
  if (subject.status === SUBJECT_STATUS.ARCHIVED) {
    throw ApiError.conflict('Môn học đã được lưu trữ', 'SUBJECT_ARCHIVED');
  }
  subject.status = SUBJECT_STATUS.ARCHIVED;
  subject.pinned = false;
  subject.updatedBy = ownerId;
  await subject.save();
  return (await withCounts([subject]))[0];
}

// UC-SUB-06
async function restore(subjectId, ownerId) {
  const subject = await getOwnedSubject(subjectId, ownerId);
  if (subject.status === SUBJECT_STATUS.ACTIVE) throw ApiError.conflict('Môn học đang hoạt động', 'SUBJECT_NOT_ARCHIVED');
  subject.status = SUBJECT_STATUS.ACTIVE;
  subject.order = await nextOrder(ownerId);
  subject.updatedBy = ownerId;
  await subject.save();
  return (await withCounts([subject]))[0];
}

// UC-SUB-07 / BR-26: permanent delete of the subject, its documents and their files.
async function remove(subjectId, ownerId) {
  const subject = await getOwnedSubject(subjectId, ownerId);
  const docs = await SubjectDocument.find({ subject: subject._id }).select('file.storedName');
  await SubjectDocument.deleteMany({ subject: subject._id });
  await subject.deleteOne();
  await Promise.all(docs.map((d) => removeStoredFile(d.file.storedName)));
}

module.exports = {
  getOwnedSubject,
  list,
  get,
  create,
  createFromCatalog,
  update,
  setPinned,
  reorder,
  archive,
  restore,
  remove,
};
