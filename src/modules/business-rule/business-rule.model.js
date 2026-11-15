const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// Sub-schema: Lưu vết lịch sử mỗi lần Admin sửa quy tắc (phục vụ UC-BRL-02)
const ruleHistorySchema = new mongoose.Schema(
  {
    oldValue: { type: mongoose.Schema.Types.Mixed },
    newValue: { type: mongoose.Schema.Types.Mixed },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: { type: String, trim: true, default: 'Cập nhật giá trị quy tắc' },
    changedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Schema chính: Quy tắc nghiệp vụ (Business Rule)
const businessRuleSchema = new mongoose.Schema(
  {
    ruleCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true, // vd: BR-15, BR-17, BR-05, BR-16
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 250,
    },
    category: {
      type: String,
      required: true,
      enum: ['AI', 'RISK', 'REVISION', 'MASTERY', 'GENERAL'],
      default: 'GENERAL',
    },
    value: {
      type: mongoose.Schema.Types.Mixed, // Hỗ trợ lưu số, chuỗi, hoặc mảng/object
      required: true,
    },
    defaultValue: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    unit: {
      type: String,
      trim: true,
      default: '',
    },
    description: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    history: [ruleHistorySchema],
  },
  { timestamps: true },
);

businessRuleSchema.plugin(softDeletePlugin);
businessRuleSchema.plugin(auditPlugin);

businessRuleSchema.index({ ruleCode: 1 });
businessRuleSchema.index({ category: 1, isActive: 1 });

module.exports = mongoose.model('BusinessRule', businessRuleSchema);