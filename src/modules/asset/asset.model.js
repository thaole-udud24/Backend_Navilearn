const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');
// Reuse the student-document module's role enum instead of duplicating it (same business concept,
// "document_role" per doc section 3.2).
const { DOCUMENT_ROLES } = require('../student-document/student-document.model');

// Tài liệu nguồn (PDF/DOCX) uploaded by Admin — no text extraction / OCR yet (BRD: "chưa hỗ trợ
// OCR"), so a file is marked `active` as soon as it's stored, with no fake processing step.
const assetSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', default: null },
    assetType: { type: String, enum: ['document'], default: 'document' },
    documentRole: { type: String, enum: DOCUMENT_ROLES, default: 'SUPPLEMENT' },
    fileUrl: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    tags: { type: [String], default: [] },
    important: { type: Boolean, default: false },
    // "Xuất bản cho SV" — default true matches the de-facto behavior before this field existed
    // (every uploaded asset was immediately visible to students).
    studentVisible: { type: Boolean, default: true },
    // Cosmetic until a real extraction pipeline exists (see the comment above): nothing ever moves
    // this past 'pending' today, same as subject.document's old processingStatus.
    processingStatus: { type: String, enum: ['pending', 'processed', 'error'], default: 'pending' },
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
  },
  { timestamps: true },
);

assetSchema.plugin(softDeletePlugin);
assetSchema.plugin(auditPlugin);
assetSchema.index({ status: 1, concept: 1, createdAt: -1 });

module.exports = mongoose.model('AssetItem', assetSchema);
