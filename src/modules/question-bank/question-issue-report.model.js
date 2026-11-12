const mongoose = require('mongoose');
const auditPlugin = require('../../plugins/audit.plugin');

// Student-reported issue on a question (UC-ASM-16 creates it, UC-QBK-10/12 let admin review/resolve it).
const questionIssueReportSchema = new mongoose.Schema(
  {
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'QuestionItem', required: true },
    reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, enum: ['wrong_answer', 'unclear', 'typo', 'duplicate', 'other'], required: true },
    description: { type: String, trim: true, maxlength: 1000, default: '' },
    status: { type: String, enum: ['open', 'resolved', 'dismissed'], default: 'open' },
    resolution: { type: String, trim: true, maxlength: 1000, default: '' },
    resolvedBy: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

questionIssueReportSchema.plugin(auditPlugin);
questionIssueReportSchema.index({ question: 1, status: 1 });

module.exports = mongoose.model('QuestionIssueReport', questionIssueReportSchema);
