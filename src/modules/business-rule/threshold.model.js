const mongoose = require('mongoose');
const auditPlugin = require('../../plugins/audit.plugin');

// UC-BRL-10: admin-configurable numeric thresholds (e.g. mastery level cut points). Keyed so any
// module can add its own thresholds without a schema change here.
const thresholdSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, trim: true, maxlength: 100 },
    value: { type: Number, required: true },
    description: { type: String, trim: true, maxlength: 500, default: '' },
  },
  { timestamps: true },
);

thresholdSchema.plugin(auditPlugin);

module.exports = mongoose.model('Threshold', thresholdSchema);
