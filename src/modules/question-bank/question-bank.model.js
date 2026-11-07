const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// QuestionBank module (scaffolded from _template; business logic pending per BRD).
const templateItemSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
  },
  { timestamps: true },
);

templateItemSchema.plugin(softDeletePlugin);
templateItemSchema.plugin(auditPlugin);
templateItemSchema.index({ owner: 1, createdAt: -1 });

module.exports = mongoose.model('QuestionBankItem', templateItemSchema);
