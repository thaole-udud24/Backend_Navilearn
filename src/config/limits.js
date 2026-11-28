// Shared numeric caps referenced by more than one module, kept in one place instead of inline.
module.exports = {
  // BR-20/BR-43 (doc: "≤ 30 tài liệu/môn"): no per-subject scoping left in this codebase, so this
  // is a simple per-owner cap on active personal documents instead.
  STUDENT_DOCUMENT_MAX_PER_OWNER: 30,
};
