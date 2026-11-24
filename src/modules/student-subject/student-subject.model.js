const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// A student's "Khoá học của tôi" entry (ST-01). There is no separate Subject/Course entity in this
// codebase (see knowledge.model.js) — a top-level Concept (parentConcept = null) stands in for
// "môn học", matching how Goal/PlanTemplate/AssessmentConfig already reference Concept directly.
const studentSubjectSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Either `concept` (ST-01 "Chọn từ danh mục chung") or the custom* fields below ("Tạo môn của
    // riêng tôi") is set, never both — a self-made subject has no Concept, so it carries no lộ
    // trình/Mastery/question-bank features, only the student's own label.
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', default: null },
    customTitle: { type: String, trim: true, maxlength: 200 },
    customDescription: { type: String, trim: true, maxlength: 500 },
    customColor: { type: String, trim: true, maxlength: 20 },
    pinned: { type: Boolean, default: false },
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true },
);

studentSubjectSchema.plugin(softDeletePlugin);
studentSubjectSchema.plugin(auditPlugin);
studentSubjectSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('StudentSubjectItem', studentSubjectSchema);
