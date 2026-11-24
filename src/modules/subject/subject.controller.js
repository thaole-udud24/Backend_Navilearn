const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const subjects = require('./subject.service');
const documents = require('./subject.document.service');

// ---- personal subjects (STUDENT) ----
const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await subjects.list(req.user.id, req.query);
  return ok(res, items, 'OK', meta);
});
const getCtrl = asyncHandler(async (req, res) => ok(res, await subjects.get(req.params.id, req.user.id)));
const createCtrl = asyncHandler(async (req, res) => created(res, await subjects.create(req.user.id, req.body)));
const fromCatalogCtrl = asyncHandler(async (req, res) =>
  created(res, await subjects.createFromCatalog(req.user.id, req.body.catalogSubjectId)),
);
const updateCtrl = asyncHandler(async (req, res) =>
  ok(res, await subjects.update(req.params.id, req.user.id, req.body), 'Đã cập nhật môn học'),
);
const pinCtrl = asyncHandler(async (req, res) =>
  ok(res, await subjects.setPinned(req.params.id, req.user.id, req.body.pinned)),
);
const reorderCtrl = asyncHandler(async (req, res) => {
  await subjects.reorder(req.user.id, req.body.ids);
  return ok(res, null, 'Đã sắp xếp lại môn học');
});
const archiveCtrl = asyncHandler(async (req, res) =>
  ok(res, await subjects.archive(req.params.id, req.user.id), 'Đã lưu trữ môn học'),
);
const restoreCtrl = asyncHandler(async (req, res) =>
  ok(res, await subjects.restore(req.params.id, req.user.id), 'Đã khôi phục môn học'),
);
const removeCtrl = asyncHandler(async (req, res) => {
  await subjects.remove(req.params.id, req.user.id);
  return noContent(res);
});

// ---- personal documents (STUDENT) ----
const listDocumentsCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await documents.listPersonal(req.params.id, req.user.id, req.query);
  return ok(res, items, 'OK', meta);
});
const listUploadsCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await documents.listUploads(req.params.id, req.user.id, req.query);
  return ok(res, items, 'OK', meta);
});
const getDocumentCtrl = asyncHandler(async (req, res) =>
  ok(res, await documents.getPersonal(req.params.id, req.params.docId, req.user.id)),
);
const createDocumentCtrl = asyncHandler(async (req, res) =>
  created(res, await documents.createPersonal(req.params.id, req.user.id, req.file, req.body), 'Đã tải tài liệu lên'),
);
const updateDocumentCtrl = asyncHandler(async (req, res) =>
  ok(res, await documents.updatePersonal(req.params.id, req.params.docId, req.user.id, req.body), 'Đã cập nhật tài liệu'),
);
const replaceDocumentFileCtrl = asyncHandler(async (req, res) =>
  ok(
    res,
    await documents.replacePersonalFile(req.params.id, req.params.docId, req.user.id, req.file),
    'Đã thay thế tệp',
  ),
);
const removeDocumentCtrl = asyncHandler(async (req, res) => {
  await documents.removePersonal(req.params.id, req.params.docId, req.user.id);
  return noContent(res);
});
const downloadDocumentCtrl = asyncHandler(async (req, res) => {
  const file = await documents.downloadPersonal(req.params.id, req.params.docId, req.user.id);
  return res.download(file.path, file.name);
});

module.exports = {
  listCtrl,
  getCtrl,
  createCtrl,
  fromCatalogCtrl,
  updateCtrl,
  pinCtrl,
  reorderCtrl,
  archiveCtrl,
  restoreCtrl,
  removeCtrl,
  listDocumentsCtrl,
  listUploadsCtrl,
  getDocumentCtrl,
  createDocumentCtrl,
  updateDocumentCtrl,
  replaceDocumentFileCtrl,
  removeDocumentCtrl,
  downloadDocumentCtrl,
};
