const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const AssetItem = require('./asset.model');

async function list(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { status: 'active', ...(query.concept ? { concept: query.concept } : {}) };
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
    description: data.description ?? '',
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

module.exports = { list, getById, create, remove };
