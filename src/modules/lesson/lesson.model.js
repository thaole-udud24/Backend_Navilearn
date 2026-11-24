const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// Thư viện bài học: a reusable, standalone lesson — same shape as a plan-template step (title,
// objectives, block-format theory, embedded quiz) but not tied to any one lộ trình, so Admin can
// browse/manage a library of lessons independent of which templates eventually (re)use them.
const lessonSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 150 },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },
    objectives: { type: [String], default: [], validate: (v) => v.length <= 6 },
    theoryContent: { type: String, trim: true, maxlength: 8000, default: '' },
    questions: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'QuestionItem' }], default: [] },
    estimatedMinutes: { type: Number, min: 5, max: 480, default: 30 },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    source: { type: String, enum: ['manual', 'ai', 'import'], default: 'manual' },
  },
  { timestamps: true },
);

lessonSchema.plugin(softDeletePlugin);
lessonSchema.plugin(auditPlugin);
lessonSchema.index({ status: 1, concept: 1, createdAt: -1 });

module.exports = mongoose.model('LessonItem', lessonSchema);
