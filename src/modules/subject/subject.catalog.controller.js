const asyncHandler = require('../../utils/asyncHandler');
const { ok, created } = require('../../utils/response');
const catalog = require('./subject.catalog.service');
const sharedDocs = require('./subject.document.service');

// ---- shared subject catalog ----
const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await catalog.list(req.user, req.query);
  return ok(res, items, 'OK', meta);
});
const getCtrl = asyncHandler(async (req, res) => ok(res, await catalog.get(req.user, req.params.id)));
const createCtrl = asyncHandler(async (req, res) =>
  created(res, await catalog.create(req.user.id, req.body), 'Đã thêm môn học vào danh mục chung'),
);
const updateCtrl = asyncHandler(async (req, res) =>
  ok(res, await catalog.update(req.user.id, req.params.id, req.body), 'Đã cập nhật môn học'),
);
const deactivateCtrl = asyncHandler(async (req, res) =>
  ok(res, await catalog.deactivate(req.user.id, req.params.id), 'Đã ngừng sử dụng môn học'),
);
const restoreCtrl = asyncHandler(async (req, res) =>
  ok(res, await catalog.restore(req.user.id, req.params.id), 'Đã khôi phục môn học'),
);
const exportCtrl = asyncHandler(async (req, res) => {
  const csv = await catalog.exportCsv();
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="subject-catalog.csv"');
  return res.status(200).send(csv);
});

// ---- shared document library ----
const listDocumentsCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await sharedDocs.listShared(req.user, req.query);
  return ok(res, items, 'OK', meta);
});
const getDocumentCtrl = asyncHandler(async (req, res) =>
  ok(res, await sharedDocs.getShared(req.user, req.params.id)),
);
const downloadDocumentCtrl = asyncHandler(async (req, res) => {
  const file = await sharedDocs.downloadShared(req.user, req.params.id);
  return res.download(file.path, file.name);
});
const createDocumentCtrl = asyncHandler(async (req, res) =>
  created(res, await sharedDocs.createShared(req.user.id, req.file, req.body), 'Đã tải tài liệu lên thư viện chung'),
);
const updateDocumentCtrl = asyncHandler(async (req, res) =>
  ok(res, await sharedDocs.updateShared(req.user.id, req.params.id, req.body), 'Đã cập nhật tài liệu'),
);
const removeDocumentCtrl = asyncHandler(async (req, res) => {
  await sharedDocs.removeShared(req.params.id);
  return ok(res, null, 'Đã gỡ tài liệu khỏi thư viện chung');
});
const importDocumentsCtrl = asyncHandler(async (req, res) =>
  ok(res, await sharedDocs.importShared(req.user.id, req.files, req.body), 'Đã xử lý nhập hàng loạt'),
);

module.exports = {
  listCtrl,
  getCtrl,
  createCtrl,
  updateCtrl,
  deactivateCtrl,
  restoreCtrl,
  exportCtrl,
  listDocumentsCtrl,
  getDocumentCtrl,
  downloadDocumentCtrl,
  createDocumentCtrl,
  updateDocumentCtrl,
  removeDocumentCtrl,
  importDocumentsCtrl,
};
