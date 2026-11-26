const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const personal = require('./knowledge.personal.service');
const notes = require('./knowledge.note.service');
const proposals = require('./knowledge.proposal.service');

// ---- structure ----
const treeCtrl = asyncHandler(async (req, res) =>
  ok(res, await personal.getTree(req.params.subjectId, req.user.id, req.query)),
);
const searchCtrl = asyncHandler(async (req, res) =>
  ok(res, await personal.searchNodes(req.params.subjectId, req.user.id, req.query.q, req.query)),
);
const createNodeCtrl = asyncHandler(async (req, res) =>
  created(res, await personal.createNode(req.params.subjectId, req.user.id, req.body), 'Đã thêm nút kiến thức'),
);
const updateNodeCtrl = asyncHandler(async (req, res) =>
  ok(res, await personal.updateNode(req.params.id, req.user.id, req.body), 'Đã cập nhật nút kiến thức'),
);
const archiveNodeCtrl = asyncHandler(async (req, res) =>
  ok(res, await personal.archiveNode(req.params.id, req.user.id), 'Đã ngừng sử dụng nút kiến thức'),
);
const restoreNodeCtrl = asyncHandler(async (req, res) =>
  ok(res, await personal.restoreNode(req.params.id, req.user.id), 'Đã khôi phục nút kiến thức'),
);
const applyTemplateCtrl = asyncHandler(async (req, res) =>
  ok(res, await personal.applyTemplate(req.params.subjectId, req.user.id, req.body.conceptId), 'Đã áp dụng cấu trúc mẫu'),
);

// ---- notes ----
const listNotesCtrl = asyncHandler(async (req, res) =>
  ok(res, await notes.listNotes(req.user.id, req.query.personalConcept)),
);
const createNoteCtrl = asyncHandler(async (req, res) =>
  created(res, await notes.createNote(req.user.id, req.body), 'Đã thêm ghi chú'),
);
const updateNoteCtrl = asyncHandler(async (req, res) =>
  ok(res, await notes.updateNote(req.params.id, req.user.id, req.body.content), 'Đã cập nhật ghi chú'),
);
const deleteNoteCtrl = asyncHandler(async (req, res) => {
  await notes.deleteNote(req.params.id, req.user.id);
  return noContent(res);
});

// ---- AI proposals ----
const listProposalsCtrl = asyncHandler(async (req, res) =>
  ok(res, await proposals.listProposals(req.params.subjectId, req.user.id, req.query)),
);
const generateProposalCtrl = asyncHandler(async (req, res) =>
  created(res, await proposals.generateProposal(req.params.subjectId, req.user.id, req.body), 'AI đã đề xuất cấu trúc'),
);
const confirmProposalCtrl = asyncHandler(async (req, res) =>
  ok(res, await proposals.confirmProposal(req.params.id, req.user.id), 'Đã xác nhận cấu trúc do AI đề xuất'),
);
const rejectProposalCtrl = asyncHandler(async (req, res) =>
  ok(res, await proposals.rejectProposal(req.params.id, req.user.id), 'Đã từ chối đề xuất'),
);

module.exports = {
  treeCtrl,
  searchCtrl,
  createNodeCtrl,
  updateNodeCtrl,
  archiveNodeCtrl,
  restoreNodeCtrl,
  applyTemplateCtrl,
  listNotesCtrl,
  createNoteCtrl,
  updateNoteCtrl,
  deleteNoteCtrl,
  listProposalsCtrl,
  generateProposalCtrl,
  confirmProposalCtrl,
  rejectProposalCtrl,
};
