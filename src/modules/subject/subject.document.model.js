const mongoose = require('mongoose');
const auditPlugin = require('../../plugins/audit.plugin');
const { SUBJECT_SCOPE, PROCESSING_STATUS } = require('./subject.constants');

// A learning document attached to a subject: personal (owner set) or part of the shared library (owner null).
const documentSchema = new mongoose.Schema(
  {
    scope: { type: String, enum: Object.values(SUBJECT_SCOPE), default: SUBJECT_SCOPE.PERSONAL },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    tags: { type: [String], default: [] },
    important: { type: Boolean, default: false },
    // Free-text until the KNW module can link real chapter/topic/concept nodes.
    classification: {
      chapter: { type: String, trim: true, maxlength: 200, default: '' },
      topic: { type: String, trim: true, maxlength: 200, default: '' },
      concept: { type: String, trim: true, maxlength: 200, default: '' },
    },
    file: {
      originalName: { type: String, required: true },
      storedName: { type: String, required: true },
      mimeType: { type: String, required: true },
      size: { type: Number, required: true },
    },
    version: { type: Number, default: 1 },
    processingStatus: {
      type: String,
      enum: Object.values(PROCESSING_STATUS),
      default: PROCESSING_STATUS.PENDING,
    },
    processingError: { type: String, default: '' },
  },
  { timestamps: true },
);

documentSchema.plugin(auditPlugin);
documentSchema.index({ subject: 1, createdAt: -1 });
documentSchema.index({ owner: 1, scope: 1 });

module.exports = mongoose.model('SubjectDocument', documentSchema);
