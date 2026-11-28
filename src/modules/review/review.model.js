const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// Review module (scaffolded from _template; business logic pending per BRD).
const templateItemSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
    // B11: star rating + "Về" (what the feedback is about) — real fields the admin triage view
    // (average score overall/per-category, filter by rating/category) needs and the generic
    // scaffold shape never had.
    rating: { type: Number, required: true, min: 1, max: 5 },
    category: {
      type: String,
      enum: ['lo_trinh', 'luyen_tap', 'noi_dung', 'he_thong', 'khac'],
      default: 'khac',
    },
  },
  { timestamps: true },
);

templateItemSchema.plugin(softDeletePlugin);
templateItemSchema.plugin(auditPlugin);
templateItemSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('ReviewItem', templateItemSchema);
