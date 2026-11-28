const ApiError = require('../../utils/ApiError');
const { parsePagination, buildMeta } = require('../../utils/pagination');
const AdminReportItem = require('./admin-report.model');
const { ROLES } = require('../../shared/roles');
const cloudinary = require('../../integrations/cloudinary');

// N11: `file` is the multer-saved attachment (optional — same disk-upload pattern as
// student-document.service), uploaded to Cloudinary when configured, falling back to local disk.
async function create(ownerId, data, file) {
  let attachmentUrl = null;
  if (file) {
    const cloudUrl = file.path
      ? await cloudinary.uploadImageFile(file.path, 'navilearn/reports', file.mimetype)
      : null;
    attachmentUrl = cloudUrl || `/uploads/admin-report-attachments/${file.filename}`;
  }
  return AdminReportItem.create({ owner: ownerId, createdBy: ownerId, ...data, attachmentUrl });
}

async function listForOwner(ownerId, query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { owner: ownerId, ...(query.status ? { status: query.status } : {}) };
  const [items, total] = await Promise.all([
    AdminReportItem.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    AdminReportItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function listAll(query) {
  const { page, limit, skip } = parsePagination(query);
  const filter = query.status ? { status: query.status } : {};
  const [items, total] = await Promise.all([
    // B10: admin triage table shows which student reported each issue.
    AdminReportItem.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('owner', 'email fullName'),
    AdminReportItem.countDocuments(filter),
  ]);
  return { items, meta: buildMeta(page, limit, total) };
}

async function getOwned(id, requester) {
  const item = await AdminReportItem.findById(id);
  if (!item) throw ApiError.notFound('Item not found');
  if (requester.role !== ROLES.ADMIN && String(item.owner) !== String(requester.id)) {
    throw ApiError.forbidden('Not the owner of this item');
  }
  return item;
}

async function updateStatus(id, requesterId, status) {
  const item = await AdminReportItem.findById(id);
  if (!item) throw ApiError.notFound('Item not found');
  item.status = status;
  item.updatedBy = requesterId;
  await item.save();
  return item;
}

async function remove(id, requester) {
  const item = await getOwned(id, requester);
  await item.softDelete();
}

// B10: admin's reply, shown back to the reporting student on their own "Báo cáo sự cố" page.
async function respond(id, adminId, message) {
  const item = await AdminReportItem.findById(id);
  if (!item) throw ApiError.notFound('Item not found');
  item.adminResponse = message;
  item.respondedBy = adminId;
  item.respondedAt = new Date();
  item.updatedBy = adminId;
  await item.save();
  return item;
}

module.exports = { create, listForOwner, listAll, getOwned, updateStatus, remove, respond };
