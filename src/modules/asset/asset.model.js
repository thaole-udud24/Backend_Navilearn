const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// Tài liệu nguồn (PDF/DOCX) uploaded by Admin — no text extraction / OCR yet (BRD: "chưa hỗ trợ
// OCR"), so a file is marked `active` as soon as it's stored, with no fake processing step.
const assetSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', default: null },
    assetType: { type: String, enum: ['document'], default: 'document' },
    fileUrl: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
  },
  { timestamps: true },
);

assetSchema.plugin(softDeletePlugin);
assetSchema.plugin(auditPlugin);
assetSchema.index({ status: 1, concept: 1, createdAt: -1 });

module.exports = mongoose.model('AssetItem', assetSchema);
