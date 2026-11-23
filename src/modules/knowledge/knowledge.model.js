const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// Concept: smallest knowledge unit that question bank / mastery are tracked against.
const conceptSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000, default: '' },
    order: { type: Number, default: 0 },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    // Provenance: who/what produced this record — shown in the admin UI, never used for access control.
    source: { type: String, enum: ['manual', 'ai', 'import'], default: 'manual' },
    // Hierarchy: chapter -> topic -> concept, modeled as a self-referencing tree (null = top-level).
    // Named parentConcept, not parent — Mongoose documents reserve `.parent` as the subdocument
    // parent accessor, and a schema path with that name shadows it and breaks model compilation.
    parentConcept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', default: null },
    // Academic relations: a DAG separate from the tree above — A must be learned before B, or A is
    // simply relevant context for C. Both are concept-to-concept, never duplicated as content.
    prerequisites: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }], default: [] },
    related: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Concept' }], default: [] },
  },
  { timestamps: true },
);

conceptSchema.plugin(softDeletePlugin);
conceptSchema.plugin(auditPlugin);
conceptSchema.index({ status: 1, order: 1 });
conceptSchema.index({ parentConcept: 1 });

module.exports = mongoose.model('Concept', conceptSchema);
