const mongoose = require('mongoose');
const auditPlugin = require('../../plugins/audit.plugin');
const { LEVEL_ORDER } = require('./knowledge.helpers');

// A node of a student's own knowledge structure for one of their courses (StudentSubjectItem):
// chapter -> topic -> concept. Kept apart from the shared, admin-managed Concept tree on purpose: other
// modules (mastery, question bank, plans) point at Concept, and a new personal node has no Mastery yet.
// `owner` refs User, so account deletion purges these automatically (BR-26).
const personalConceptSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    studentSubject: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentSubjectItem', required: true },
    parentNode: { type: mongoose.Schema.Types.ObjectId, ref: 'PersonalConcept', default: null },
    level: { type: String, enum: LEVEL_ORDER, required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    // UC-KNW-04: the student's own "exam focus" flag.
    examFocus: { type: Boolean, default: false },
    // Only concept-level nodes carry prerequisites (a DAG within this one course).
    prerequisites: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PersonalConcept' }], default: [] },
    source: { type: String, enum: ['manual', 'template', 'ai'], default: 'manual' },
    // Shared Concept this node was copied from when a sample structure was applied.
    sourceConcept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', default: null },
  },
  { timestamps: true },
);

personalConceptSchema.plugin(auditPlugin);
personalConceptSchema.index({ owner: 1, studentSubject: 1, status: 1 });
personalConceptSchema.index({ parentNode: 1 });

module.exports = mongoose.model('PersonalConcept', personalConceptSchema);
