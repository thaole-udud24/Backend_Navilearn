const mongoose = require('mongoose');
const auditPlugin = require('../../plugins/audit.plugin');

// A private note a student attaches to one of their own knowledge nodes (UC-KNW-10..12).
const conceptNoteSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    personalConcept: { type: mongoose.Schema.Types.ObjectId, ref: 'PersonalConcept', required: true },
    content: { type: String, required: true, trim: true, maxlength: 5000 },
  },
  { timestamps: true },
);

conceptNoteSchema.plugin(auditPlugin);
conceptNoteSchema.index({ personalConcept: 1, createdAt: -1 });

module.exports = mongoose.model('ConceptNote', conceptNoteSchema);
