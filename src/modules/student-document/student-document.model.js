const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// Tài liệu ôn thi cá nhân (PDF/DOCX) a student uploads for themselves — built on the asset
// module's proven upload/storage pattern, but owner-scoped instead of admin-shared.
const DOCUMENT_ROLES = ['SYLLABUS', 'TEXTBOOK', 'SLIDES', 'PAST_EXAM', 'EXERCISES', 'SUPPLEMENT', 'ANSWER_KEY'];
const PROCESSING_STATUSES = ['UPLOADED', 'EXTRACTING', 'READY', 'FAILED_NO_TEXT'];

const studentDocumentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    documentRole: { type: String, enum: DOCUMENT_ROLES, default: 'SUPPLEMENT' },
    fileUrl: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
    tags: { type: [String], default: [] },
    status: { type: String, enum: ['active', 'removed'], default: 'active' },
    // Subject tag (BR-20 "gắn với mục tiêu") — nullable: documents that predate this field, or
    // that a student never tags, stay valid with no subject.
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', default: null },
    // v2.1 §4.5 doc_analysis metadata
    processingStatus: { type: String, enum: PROCESSING_STATUSES, default: 'UPLOADED' },
    extractedSummary: { type: String, trim: true, maxlength: 2000, default: '' },
    detectedTopics: { type: [String], default: [] },
    suggestedConcepts: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }], default: [] },
    analyzedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

studentDocumentSchema.plugin(softDeletePlugin);
studentDocumentSchema.plugin(auditPlugin);
studentDocumentSchema.index({ owner: 1, status: 1, createdAt: -1 });

module.exports = mongoose.model('StudentDocumentItem', studentDocumentSchema);
module.exports.DOCUMENT_ROLES = DOCUMENT_ROLES;
module.exports.PROCESSING_STATUSES = PROCESSING_STATUSES;
