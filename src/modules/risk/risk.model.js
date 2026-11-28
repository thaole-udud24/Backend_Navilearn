const mongoose = require('mongoose');

// N9/BR-13: student's response to a system-generated risk warning ("giữ nguyên" / "nhắc tôi sau").
// Warnings themselves are never stored — they're recomputed live from goals/plans/mastery each time
// (see risk.service.listWarnings) — this collection only remembers which warning `key` the student
// already acted on, so it can be hidden on the next read. `until: null` = dismissed indefinitely
// ("giữ nguyên"); `until: <date>` = snoozed until then ("nhắc tôi sau").
const dismissalSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    key: { type: String, required: true, trim: true, maxlength: 200 },
    action: { type: String, enum: ['keep', 'snooze'], required: true },
    until: { type: Date, default: null },
  },
  { timestamps: true },
);

dismissalSchema.index({ owner: 1, key: 1 }, { unique: true });

module.exports = mongoose.model('RiskWarningDismissal', dismissalSchema);
