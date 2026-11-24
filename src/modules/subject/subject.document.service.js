const { z } = require('zod');
const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const importBulk = require('../../utils/importBulk');
const Subject = require('./subject.model');
const SubjectDocument = require('./subject.document.model');
const { getOwnedSubject } = require('./subject.service');
const { removeStoredFile, storedPath } = require('./subject.upload');
const {
  SUBJECT_SCOPE,
  SUBJECT_STATUS,
  PROCESSING_STATUS,
  MAX_DOCUMENTS_PER_SUBJECT,
} = require('./subject.constants');
const { escapeRegex, toPublicDocument } = require('./subject.helpers');
const { objectId, documentMeta } = require('./subject.validation');
const { ROLES } = require('../../shared/roles');

const toFileMeta = (file) => ({
  originalName: file.originalname,
  storedName: file.filename,
  mimeType: file.mimetype,
  size: file.size,
});

const defaultName = (file) => file.originalname.replace(/\.[^.]+$/, '');

function applyMeta(doc, data) {
  if (data.name !== undefined) doc.name = data.name;
  if (data.description !== undefined) doc.description = data.description;
  if (data.tags !== undefined) doc.tags = [...new Set(data.tags)];
  if (data.important !== undefined) doc.important = data.important;
  ['chapter', 'topic', 'concept'].forEach((key) => {
    if (data[key] !== undefined) doc.classification[key] = data[key];
  });
}

/** Search + classification filters shared by personal and shared document lists. */
function buildFilter(base, query) {
  const filter = { ...base };
  if (query.q) {
    const rx = { $regex: escapeRegex(query.q), $options: 'i' };
    filter.$or = [{ name: rx }, { description: rx }, { tags: rx }, { 'file.originalName': rx }];
  }
  if (query.tag) filter.tags = query.tag;
  if (query.important !== undefined) filter.important = query.important;
  ['chapter', 'topic', 'concept'].forEach((key) => {
    if (query[key]) filter[`classification.${key}`] = { $regex: escapeRegex(query[key]), $options: 'i' };
  });
  if (query.processingStatus) filter.processingStatus = query.processingStatus;
  return filter;
}

async function paged(filter, query, sort) {
  const { page, limit, skip } = parsePagination(query);
  const [docs, total] = await Promise.all([
    SubjectDocument.find(filter).sort(sort).skip(skip).limit(limit),
    SubjectDocument.countDocuments(filter),
  ]);
  return { items: docs.map(toPublicDocument), meta: buildMeta(page, limit, total) };
}

async function getOwnedDocument(subjectId, docId, ownerId) {
  await getOwnedSubject(subjectId, ownerId);
  const doc = await SubjectDocument.findOne({
    _id: docId,
    subject: subjectId,
    scope: SUBJECT_SCOPE.PERSONAL,
    owner: ownerId,
  });
  if (!doc) throw ApiError.notFound('Không tìm thấy tài liệu');
  return doc;
}

function requireFile(file) {
  if (!file) throw ApiError.badRequest('Chưa chọn tệp', 'FILE_REQUIRED');
}

// ---------- personal documents ----------

// UC-SUB-09 + UC-SUB-18 (search/filter)
async function listPersonal(subjectId, ownerId, query) {
  await getOwnedSubject(subjectId, ownerId);
  const filter = buildFilter({ subject: subjectId, scope: SUBJECT_SCOPE.PERSONAL, owner: ownerId }, query);
  return paged(filter, query, { important: -1, createdAt: -1 });
}

// UC-SUB-10: upload history with processing status, newest first.
async function listUploads(subjectId, ownerId, query) {
  await getOwnedSubject(subjectId, ownerId);
  const filter = buildFilter({ subject: subjectId, scope: SUBJECT_SCOPE.PERSONAL, owner: ownerId }, query);
  return paged(filter, query, { createdAt: -1 });
}

async function getPersonal(subjectId, docId, ownerId) {
  return toPublicDocument(await getOwnedDocument(subjectId, docId, ownerId));
}

// UC-SUB-11 (BR-43: at most 30 documents per subject)
async function createPersonal(subjectId, ownerId, file, data) {
  try {
    requireFile(file);
    const subject = await getOwnedSubject(subjectId, ownerId, { requireActive: true });
    const count = await SubjectDocument.countDocuments({ subject: subject._id });
    if (count >= MAX_DOCUMENTS_PER_SUBJECT) {
      throw ApiError.conflict(`Mỗi môn học tối đa ${MAX_DOCUMENTS_PER_SUBJECT} tài liệu`, 'DOCUMENT_LIMIT_REACHED');
    }
    const doc = new SubjectDocument({
      scope: SUBJECT_SCOPE.PERSONAL,
      owner: ownerId,
      subject: subject._id,
      name: defaultName(file),
      file: toFileMeta(file),
      createdBy: ownerId,
    });
    applyMeta(doc, data);
    await doc.save();
    return toPublicDocument(doc);
  } catch (err) {
    if (file) await removeStoredFile(file.filename);
    throw err;
  }
}

// UC-SUB-12 / 13 / 15: name, description, classification, tags, important flag.
async function updatePersonal(subjectId, docId, ownerId, data) {
  await getOwnedSubject(subjectId, ownerId, { requireActive: true });
  const doc = await getOwnedDocument(subjectId, docId, ownerId);
  applyMeta(doc, data);
  doc.updatedBy = ownerId;
  await doc.save();
  return toPublicDocument(doc);
}

// UC-SUB-14: new file version; extraction has to run again.
async function replacePersonalFile(subjectId, docId, ownerId, file) {
  try {
    requireFile(file);
    await getOwnedSubject(subjectId, ownerId, { requireActive: true });
    const doc = await getOwnedDocument(subjectId, docId, ownerId);
    const oldName = doc.file.storedName;
    doc.file = toFileMeta(file);
    doc.version += 1;
    doc.processingStatus = PROCESSING_STATUS.PENDING;
    doc.processingError = '';
    doc.updatedBy = ownerId;
    await doc.save();
    await removeStoredFile(oldName);
    return toPublicDocument(doc);
  } catch (err) {
    if (file) await removeStoredFile(file.filename);
    throw err;
  }
}

// UC-SUB-16
async function removePersonal(subjectId, docId, ownerId) {
  const doc = await getOwnedDocument(subjectId, docId, ownerId);
  await doc.deleteOne();
  await removeStoredFile(doc.file.storedName);
}

// UC-SUB-17
async function downloadPersonal(subjectId, docId, ownerId) {
  const doc = await getOwnedDocument(subjectId, docId, ownerId);
  return { path: storedPath(doc.file.storedName), name: doc.file.originalName };
}

// ---------- shared library ----------

async function getActiveCatalogSubject(subjectId) {
  const subject = await Subject.findOne({
    _id: subjectId,
    scope: SUBJECT_SCOPE.SHARED,
    status: SUBJECT_STATUS.ACTIVE,
  });
  if (!subject) throw ApiError.notFound('Môn học không có trong danh mục chung hoặc đã ngừng sử dụng');
  return subject;
}

async function getSharedDocument(docId) {
  const doc = await SubjectDocument.findOne({ _id: docId, scope: SUBJECT_SCOPE.SHARED });
  if (!doc) throw ApiError.notFound('Không tìm thấy tài liệu');
  return doc;
}

// UC-SUB-25 / 26. Students only see documents of subjects still in use; admins also see processing state.
async function listShared(requester, query) {
  const base = { scope: SUBJECT_SCOPE.SHARED };
  const isAdmin = requester.role === ROLES.ADMIN;
  if (query.subjectId) base.subject = query.subjectId;
  if (!isAdmin) {
    const active = await Subject.find({ scope: SUBJECT_SCOPE.SHARED, status: SUBJECT_STATUS.ACTIVE }).select('_id');
    const activeIds = active.map((s) => String(s._id));
    if (query.subjectId && !activeIds.includes(query.subjectId)) return paged({ _id: null }, query, {});
    if (!query.subjectId) base.subject = { $in: activeIds };
  }
  return paged(buildFilter(base, query), query, { createdAt: -1 });
}

async function getShared(requester, docId) {
  const doc = await getSharedDocument(docId);
  if (requester.role !== ROLES.ADMIN) await getActiveCatalogSubject(doc.subject);
  return toPublicDocument(doc);
}

async function downloadShared(requester, docId) {
  const doc = await getSharedDocument(docId);
  if (requester.role !== ROLES.ADMIN) await getActiveCatalogSubject(doc.subject);
  return { path: storedPath(doc.file.storedName), name: doc.file.originalName };
}

async function saveSharedDocument(adminId, subjectId, file, data) {
  const subject = await getActiveCatalogSubject(subjectId);
  const doc = new SubjectDocument({
    scope: SUBJECT_SCOPE.SHARED,
    owner: null,
    subject: subject._id,
    name: defaultName(file),
    file: toFileMeta(file),
    createdBy: adminId,
  });
  applyMeta(doc, data);
  await doc.save();
  return doc;
}

// UC-SUB-27
async function createShared(adminId, file, data) {
  try {
    requireFile(file);
    return toPublicDocument(await saveSharedDocument(adminId, data.subjectId, file, data));
  } catch (err) {
    if (file) await removeStoredFile(file.filename);
    throw err;
  }
}

// UC-SUB-28
async function updateShared(adminId, docId, data) {
  const doc = await getSharedDocument(docId);
  applyMeta(doc, data);
  doc.updatedBy = adminId;
  await doc.save();
  return toPublicDocument(doc);
}

// UC-SUB-29: "gỡ" = remove from the library together with its file.
async function removeShared(docId) {
  const doc = await getSharedDocument(docId);
  await doc.deleteOne();
  await removeStoredFile(doc.file.storedName);
}

// UC-SUB-30: bulk import. Each file is matched to a manifest row by its filename; rows may override the subject.
const importRowSchema = z.object({ file: z.any(), subjectId: objectId, ...documentMeta });

async function importShared(adminId, files, { subjectId, manifest = [] }) {
  if (!files || files.length === 0) throw ApiError.badRequest('Chưa chọn tệp nào', 'FILE_REQUIRED');
  const byName = new Map(manifest.map((row) => [row.file, row]));
  const rows = files.map((file) => ({ ...(byName.get(file.originalname) || {}), file, subjectId: byName.get(file.originalname)?.subjectId || subjectId }));

  const report = await importBulk(rows, {
    schema: importRowSchema,
    create: (row) => saveSharedDocument(adminId, row.subjectId, row.file, row),
  });
  // Files whose row failed validation/creation are not kept on disk.
  const failed = report.errors.map((e) => e.row);
  await Promise.all(failed.map((i) => removeStoredFile(files[i].filename)));
  return {
    ...report,
    errors: report.errors.map((e) => ({ ...e, file: files[e.row].originalname })),
  };
}

module.exports = {
  listPersonal,
  listUploads,
  getPersonal,
  createPersonal,
  updatePersonal,
  replacePersonalFile,
  removePersonal,
  downloadPersonal,
  listShared,
  getShared,
  downloadShared,
  createShared,
  updateShared,
  removeShared,
  importShared,
};
