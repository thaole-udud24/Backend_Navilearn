const mongoose = require('mongoose');
const auditPlugin = require('../../plugins/audit.plugin');
const { SUBJECT_SCOPE, SUBJECT_STATUS } = require('./subject.constants');

// One collection for both kinds of subject: a student's personal subject (owner set) and an entry of the
// ADMIN-managed shared catalog (owner null). Shared entries are never matched by account purge (BR-26).
const subjectSchema = new mongoose.Schema(
  {
    scope: { type: String, enum: Object.values(SUBJECT_SCOPE), default: SUBJECT_SCOPE.PERSONAL },
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    status: { type: String, enum: Object.values(SUBJECT_STATUS), default: SUBJECT_STATUS.ACTIVE },
    pinned: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
    // Set when a student picked this subject from the shared catalog.
    catalogSubject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
  },
  { timestamps: true },
);

subjectSchema.plugin(auditPlugin);
subjectSchema.index({ owner: 1, status: 1, pinned: -1, order: 1 });
subjectSchema.index({ scope: 1, status: 1, name: 1 });

module.exports = mongoose.model('Subject', subjectSchema);
