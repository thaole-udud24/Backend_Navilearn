const fs = require('fs');
const path = require('path');
const ApiError = require('../../utils/ApiError');
const env = require('../../config/env');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const { STUDENT_DOCUMENT_MAX_PER_OWNER } = require('../../config/limits');
const StudentDocumentItem = require('./student-document.model');
const Concept = require('../knowledge/knowledge.model');
const { resolveSubjectConceptIds } = require('../../shared/subjectFilter');

async function list(ownerId, query, requester) {
  const { page, limit, skip } = parsePagination(query);
  const subjectIds = await resolveSubjectConceptIds(query.subjectId, requester);
  const filter = {
    owner: ownerId,
    status: 'active',
    ...(query.documentRole ? { documentRole: query.documentRole } : {}),
  };
  if (query.concept && subjectIds) {
    filter.concept = subjectIds.some((id) => String(id) === String(query.concept)) ? query.concept : null;
  } else if (query.concept) {
    filter.concept = query.concept;
  } else if (subjectIds) {
    filter.concept = { $in: subjectIds };
  }
  const [items, total] = await Promise.all([
    StudentDocumentItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('concept', 'name'),
    StudentDocumentItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

// Personal learning data (BR-02/BR-35): owner only, same precedent as wrong-item/planning.
async function getOwned(id, requesterId) {
  const item = await StudentDocumentItem.findById(id);
  if (!item) throw ApiError.notFound('Document not found');
  if (String(item.owner) !== String(requesterId)) throw ApiError.forbidden('Not the owner of this document');
  return item;
}

// `file` is the multer-saved file descriptor, already on disk by the time this runs
// (see student-document.routes.js) — mirrors asset.service.create.
async function create(ownerId, data, file) {
  const activeCount = await StudentDocumentItem.countDocuments({ owner: ownerId, status: 'active' });
  if (activeCount >= STUDENT_DOCUMENT_MAX_PER_OWNER) {
    throw ApiError.badRequest(
      `Tối đa ${STUDENT_DOCUMENT_MAX_PER_OWNER} tài liệu đang hoạt động`,
      'DOCUMENT_LIMIT_REACHED',
    );
  }
  return StudentDocumentItem.create({
    owner: ownerId,
    title: data.title,
    documentRole: data.documentRole || 'SUPPLEMENT',
    description: data.description ?? '',
    tags: data.tags ? [...new Set(data.tags)] : [],
    concept: data.concept || null,
    fileUrl: `/uploads/student-documents/${file.filename}`,
    originalName: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
    createdBy: ownerId,
  });
}

async function update(id, requesterId, data) {
  const item = await getOwned(id, requesterId);
  if (data.title !== undefined) item.title = data.title;
  if (data.documentRole !== undefined) item.documentRole = data.documentRole;
  if (data.description !== undefined) item.description = data.description;
  if (data.tags !== undefined) item.tags = [...new Set(data.tags)];
  if (data.concept !== undefined) item.concept = data.concept || null;
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

// Soft-remove keeps the row (and file on disk) — matches asset.service.remove's convention.
async function remove(id, requesterId) {
  const item = await getOwned(id, requesterId);
  item.status = 'removed';
  item.updatedBy = requesterId;
  await item.save();
}

function extractReadableText(buffer) {
  if (!buffer || buffer.length === 0) return '';
  const raw = buffer.toString('utf8');
  // Extract readable Unicode words & sentences (handles plain text, UTF-8 PDF text streams, XML text).
  const cleaned = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^\p{L}\p{N}\s.,;:!?()/-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned;
}

// v2.1 §4.5: Phân tích tài liệu (doc_analysis) — trích xuất từ khóa/chủ đề và gợi ý ánh xạ Concept.
async function analyzeDocument(id, requesterId) {
  const item = await getOwned(id, requesterId);
  item.processingStatus = 'EXTRACTING';

  let extracted = '';
  try {
    const filename = path.basename(item.fileUrl || '');
    const fullPath = path.resolve(env.STORAGE_UPLOAD_DIR, 'student-documents', filename);
    if (filename && fs.existsSync(fullPath)) {
      const buf = await fs.promises.readFile(fullPath);
      extracted = extractReadableText(buf);
    }
  } catch {
    // fallback to metadata below if file is missing on disk
  }

  const combinedText = `${item.title || ''} ${item.description || ''} ${(item.tags || []).join(' ')} ${extracted}`.trim();
  if (!combinedText || combinedText.length < 3) {
    item.processingStatus = 'FAILED_NO_TEXT';
    item.analyzedAt = new Date();
    await item.save();
    return item;
  }

  const lower = combinedText.toLowerCase();
  const concepts = await Concept.find({ status: 'active' }).select('name').limit(300).lean();
  const matched = concepts.filter((c) => {
    const name = (c.name || '').toLowerCase().trim();
    return name.length >= 3 && lower.includes(name);
  });

  const topics = [...new Set([...(item.tags || []), ...matched.map((m) => m.name)])].slice(0, 12);
  item.suggestedConcepts = matched.slice(0, 10).map((m) => m._id);
  item.detectedTopics = topics;
  item.extractedSummary = extracted
    ? extracted.slice(0, 400)
    : `Tài liệu "${item.title}" (${item.documentRole}) — ${topics.length} chủ đề nhận diện.`;
  item.processingStatus = 'READY';
  item.analyzedAt = new Date();
  item.updatedBy = requesterId;
  await item.save();
  return StudentDocumentItem.findById(item._id)
    .populate('concept', 'name')
    .populate('suggestedConcepts', 'name');
}

module.exports = { list, getOwned, create, update, remove, analyzeDocument };
