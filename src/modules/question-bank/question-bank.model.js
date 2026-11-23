const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

const optionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true, trim: true, maxlength: 300 },
    isCorrect: { type: Boolean, default: false },
  },
  { _id: false },
);

const questionSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },
    // true_false is graded exactly like mcq (same options/isCorrect shape, exactly 2 options) —
    // kept as its own type only so admin/student UI can show a simpler Đúng/Sai picker.
    type: { type: String, enum: ['mcq', 'true_false', 'essay'], default: 'mcq' },
    text: { type: String, required: true, trim: true, maxlength: 1000 },
    options: { type: [optionSchema], default: [] },
    referenceAnswer: { type: String, trim: true, maxlength: 2000, default: '' },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    points: { type: Number, default: 10, min: 1, max: 100 },
    status: { type: String, enum: ['active', 'archived'], default: 'active' },
    source: { type: String, enum: ['manual', 'ai', 'import'], default: 'manual' },
  },
  { timestamps: true },
);

questionSchema.plugin(softDeletePlugin);
questionSchema.plugin(auditPlugin);
questionSchema.index({ concept: 1, status: 1 });

module.exports = mongoose.model('QuestionItem', questionSchema);
