const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// Study plan (PLN-01/02). Student-created plans are 'active'; ADP-generated ones start as 'proposed' (BR-37/BR-54).
const sessionSchema = new mongoose.Schema({
  concept: { type: mongoose.Schema.Types.ObjectId, ref: 'Concept', required: true },
  startAt: { type: Date, required: true },
  durationMin: { type: Number, required: true, min: 5, max: 480 },
  status: { type: String, enum: ['planned', 'done', 'missed', 'cancelled'], default: 'planned' },
  // Stage name (copied from the plan-template step on apply, or set by hand for a manual session).
  // Optional at the schema level so sessions created before this field existed still read fine.
  title: { type: String, trim: true, maxlength: 150 },
  // Chapter grouping copied from the plan-template step on apply — display-only, matches
  // plan-template.model.js's own stepSchema.chapterTitle comment.
  chapterTitle: { type: String, trim: true, maxlength: 150, default: '' },
  // "Sau buổi này bạn có thể…" — copied from the template step, read-only for the student.
  objectives: { type: [String], default: [], validate: (v) => v.length <= 6 },
  note: { type: String, trim: true, maxlength: 1000 },
  // UC-PLN-TPL-03: carried over from a plan-template step (or set by hand) so a session can be a
  // real mini-lesson — theory to read, then a short quiz before it can be marked done.
  theoryContent: { type: String, trim: true, maxlength: 8000, default: '' },
  questions: { type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'QuestionItem' }], default: [] },
  // Gate: a session that carries questions can't be marked done until its quiz is passed (see
  // planning.service.updateSession / submitSessionQuiz).
  quizPassed: { type: Boolean, default: false },
});

const planSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    status: { type: String, enum: ['proposed', 'active', 'superseded'], default: 'active' },
    replaces: { type: mongoose.Schema.Types.ObjectId, ref: 'PlanningItem', default: null },
    reason: { type: String, trim: true, maxlength: 500 }, // why ADP proposed this plan (UC-ADP-03)

    sessions: { type: [sessionSchema], default: [] },
  },
  { timestamps: true },
);

planSchema.plugin(softDeletePlugin);
planSchema.plugin(auditPlugin);
planSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('PlanningItem', planSchema);
