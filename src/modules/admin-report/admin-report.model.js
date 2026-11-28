const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// AdminReport module (scaffolded from _template; business logic pending per BRD).
const templateItemSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
    // B10: admin triage reply sent back to the reporting student.
    adminResponse: { type: String, trim: true, maxlength: 2000, default: null },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    respondedAt: { type: Date, default: null },
    // N11: what kind of issue this is, where it happened, and an optional screenshot — all real,
    // student-entered fields the admin triage view can now rely on instead of free text alone.
    issueType: {
      type: String,
      enum: ['question_error', 'display_bug', 'system_error', 'other'],
      default: 'other',
    },
    location: { type: String, trim: true, maxlength: 300, default: null },
    attachmentUrl: { type: String, default: null },
  },
  { timestamps: true },
);

templateItemSchema.plugin(softDeletePlugin);
templateItemSchema.plugin(auditPlugin);
templateItemSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('AdminReportItem', templateItemSchema);
