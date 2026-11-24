const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { toCsv } = require('../../utils/csv');
const Subject = require('./subject.model');
const SubjectDocument = require('./subject.document.model');
const { SUBJECT_SCOPE, SUBJECT_STATUS } = require('./subject.constants');
const { escapeRegex, toPublicSubject, countDocumentsBySubject } = require('./subject.helpers');
const { ROLES } = require('../../shared/roles');

const NAME_COLLATION = { locale: 'vi', strength: 2 };

async function getCatalogSubject(id) {
  const subject = await Subject.findOne({ _id: id, scope: SUBJECT_SCOPE.SHARED });
  if (!subject) throw ApiError.notFound('Không tìm thấy môn học trong danh mục chung');
  return subject;
}

async function assertNameFree(name, exceptId) {
  const filter = { scope: SUBJECT_SCOPE.SHARED, name };
  if (exceptId) filter._id = { $ne: exceptId };
  if (await Subject.findOne(filter).collation(NAME_COLLATION).select('_id')) {
    throw ApiError.conflict('Danh mục chung đã có môn học trùng tên', 'SUBJECT_NAME_EXISTS');
  }
}

async function withCounts(subjects) {
  const counts = await countDocumentsBySubject(SubjectDocument, subjects.map((s) => s._id));
  return subjects.map((s) => toPublicSubject(s, counts.get(String(s._id)) || 0));
}

// UC-SUB-19. Students only ever see subjects still in use; admins can filter by status.
async function list(requester, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { scope: SUBJECT_SCOPE.SHARED };
  if (requester.role === ROLES.ADMIN) {
    if (query.status) filter.status = query.status;
  } else {
    filter.status = SUBJECT_STATUS.ACTIVE;
  }
  if (query.q) filter.name = { $regex: escapeRegex(query.q), $options: 'i' };
  const [subjects, total] = await Promise.all([
    Subject.find(filter).sort({ name: 1 }).collation(NAME_COLLATION).skip(skip).limit(limit),
    Subject.countDocuments(filter),
  ]);
  return { items: await withCounts(subjects), meta: buildMeta(page, limit, total) };
}

async function get(requester, id) {
  const subject = await getCatalogSubject(id);
  if (requester.role !== ROLES.ADMIN && subject.status !== SUBJECT_STATUS.ACTIVE) {
    throw ApiError.notFound('Không tìm thấy môn học trong danh mục chung');
  }
  return (await withCounts([subject]))[0];
}

// UC-SUB-20
async function create(adminId, data) {
  await assertNameFree(data.name);
  const subject = await Subject.create({
    scope: SUBJECT_SCOPE.SHARED,
    owner: null,
    name: data.name,
    description: data.description || '',
    createdBy: adminId,
  });
  return toPublicSubject(subject);
}

// UC-SUB-21
async function update(adminId, id, data) {
  const subject = await getCatalogSubject(id);
  if (data.name !== undefined && data.name !== subject.name) {
    await assertNameFree(data.name, subject._id);
    subject.name = data.name;
  }
  if (data.description !== undefined) subject.description = data.description;
  subject.updatedBy = adminId;
  await subject.save();
  return (await withCounts([subject]))[0];
}

async function setStatus(adminId, id, status, conflictMessage) {
  const subject = await getCatalogSubject(id);
  if (subject.status === status) throw ApiError.conflict(conflictMessage, 'SUBJECT_STATUS_UNCHANGED');
  subject.status = status;
  subject.updatedBy = adminId;
  await subject.save();
  return (await withCounts([subject]))[0];
}

// UC-SUB-23: students' own copies are untouched; the subject just leaves the catalog.
const deactivate = (adminId, id) =>
  setStatus(adminId, id, SUBJECT_STATUS.INACTIVE, 'Môn học đã ngừng sử dụng');

// UC-SUB-22
const restore = (adminId, id) => setStatus(adminId, id, SUBJECT_STATUS.ACTIVE, 'Môn học đang được sử dụng');

// UC-SUB-24: one row per document (a subject without documents still gets a row).
async function exportCsv() {
  const subjects = await Subject.find({ scope: SUBJECT_SCOPE.SHARED }).sort({ name: 1 }).collation(NAME_COLLATION);
  const docs = await SubjectDocument.find({ scope: SUBJECT_SCOPE.SHARED }).sort({ createdAt: 1 });
  const bySubject = new Map();
  docs.forEach((d) => bySubject.set(String(d.subject), [...(bySubject.get(String(d.subject)) || []), d]));

  const rows = subjects.flatMap((subject) => {
    const list = bySubject.get(String(subject._id)) || [null];
    return list.map((doc) => ({ subject, doc }));
  });
  return toCsv(rows, [
    { header: 'Môn học', value: (r) => r.subject.name },
    { header: 'Mô tả môn', value: (r) => r.subject.description },
    { header: 'Trạng thái môn', value: (r) => r.subject.status },
    { header: 'Tài liệu', value: (r) => r.doc?.name },
    { header: 'Tên tệp', value: (r) => r.doc?.file.originalName },
    { header: 'Chương', value: (r) => r.doc?.classification.chapter },
    { header: 'Chủ đề', value: (r) => r.doc?.classification.topic },
    { header: 'Khái niệm', value: (r) => r.doc?.classification.concept },
    { header: 'Thẻ', value: (r) => r.doc?.tags.join('; ') },
    { header: 'Trạng thái xử lý', value: (r) => r.doc?.processingStatus },
  ]);
}

module.exports = { list, get, create, update, deactivate, restore, exportCsv };
