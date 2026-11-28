const { z } = require('zod');
const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const importBulk = require('../../utils/importBulk');
const AssetItem = require('./asset.model');
const { createSchema } = require('./asset.validation');
const { resolveSubjectConceptIds } = require('../../shared/subjectFilter');

const importRowSchema = createSchema.extend({ file: z.any() });

async function list(query, requester) {
  const { page, limit, skip } = parsePagination(query);
  const subjectIds = await resolveSubjectConceptIds(query.subjectId, requester);
  const filter = {
    status: 'active',
    // Students only ever see what an admin has published for them; admins see everything so they
    // can manage/un-hide items.
    ...(requester?.role === 'student' ? { studentVisible: true } : {}),
  };
  if (query.concept && subjectIds) {
    filter.concept = subjectIds.some((id) => String(id) === String(query.concept)) ? query.concept : null;
  } else if (query.concept) {
    filter.concept = query.concept;
  } else if (subjectIds) {
    filter.concept = { $in: subjectIds };
  }
  const [items, total] = await Promise.all([
    AssetItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('concept', 'name'),
    AssetItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getById(id) {
  const item = await AssetItem.findById(id).populate('concept', 'name');
  if (!item) throw ApiError.notFound('Asset not found');
  return item;
}

// `file` is the multer-saved file descriptor — already on disk under ASSET_DIR by the time this
// runs (see asset.routes.js); stored here as-is since there is no OCR/text-extraction step yet.
async function create(requesterId, data, file) {
  return AssetItem.create({
    title: data.title,
    concept: data.concept || null,
    documentRole: data.documentRole ?? 'SUPPLEMENT',
    description: data.description ?? '',
    tags: data.tags ? [...new Set(data.tags)] : [],
    important: data.important ?? false,
    studentVisible: data.studentVisible ?? true,
    assetType: 'document',
    fileUrl: `/uploads/assets/${file.filename}`,
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    createdBy: requesterId,
  });
}

// Soft-remove keeps the row (and the file on disk) — only hides it from the catalog — matching the
// "không xoá cứng nội dung đã có người dùng" convention other content modules follow.
async function remove(id, requesterId) {
  const item = await getById(id);
  item.status = 'removed';
  item.updatedBy = requesterId;
  await item.save();
}

// Title/description/concept/tags/importance edit (ported from subject.document.service's
// updateShared — no file replace here, upload a new asset for that).
async function update(id, requesterId, data) {
  const item = await getById(id);
  if (data.title !== undefined) item.title = data.title;
  if (data.description !== undefined) item.description = data.description;
  if (data.concept !== undefined) item.concept = data.concept || null;
  if (data.documentRole !== undefined) item.documentRole = data.documentRole;
  if (data.tags !== undefined) item.tags = [...new Set(data.tags)];
  if (data.important !== undefined) item.important = data.important;
  if (data.studentVisible !== undefined) item.studentVisible = data.studentVisible;
  item.updatedBy = requesterId;
  await item.save();
  return getById(item.id);
}

// Bulk import (ported from subject.document.service's importShared): each uploaded file is
// matched to a manifest row by its original filename; a row may override `concept`.
async function bulkImport(requesterId, files, { concept, manifest = [] }) {
  if (!files || files.length === 0) throw ApiError.badRequest('Chưa chọn tệp nào', 'FILE_REQUIRED');
  const byName = new Map(manifest.map((row) => [row.file, row]));
  const rows = files.map((file) => {
    const row = byName.get(file.originalname) || {};
    return {
      ...row,
      file,
      title: row.title || file.originalname.replace(/\.[^.]+$/, ''),
      concept: row.concept || concept,
    };
  });

  const report = await importBulk(rows, {
    schema: importRowSchema,
    create: (row) => create(requesterId, row, row.file),
  });
  return {
    ...report,
    errors: report.errors.map((e) => ({ ...e, file: files[e.row].originalname })),
  };
}

module.exports = { list, getById, create, remove, update, bulkImport };
