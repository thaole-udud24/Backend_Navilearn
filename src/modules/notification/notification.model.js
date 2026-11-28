const mongoose = require('mongoose');
const softDeletePlugin = require('../../plugins/softDelete.plugin');
const auditPlugin = require('../../plugins/audit.plugin');

// Notification module (scaffolded from _template; business logic pending per BRD).
const templateItemSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    content: { type: String, required: true, trim: true, maxlength: 2000 },
    status: { type: String, enum: ['open', 'in_progress', 'resolved'], default: 'open' },
    // N13 "Thông báo": real per-student read-tracking/category, kept apart from `status` above
    // (that one is the admin workflow field, unrelated to a student having read this or not).
    category: { type: String, enum: ['hoc_tap', 'he_thong'], default: 'he_thong' },
    read: { type: Boolean, default: false },
    /** Optional in-app path to navigate to on click (e.g. the plan this notification is about). */
    link: { type: String, default: null },
    // B9: admin broadcast fan-out. Every per-student NotificationItem created by one admin "Gửi
    // ngay" shares a broadcastId so the admin's "Đã gửi" history can group them back into one row
    // and compute a real read rate; audienceLabel is denormalized at send time for display there.
    broadcastId: { type: mongoose.Schema.Types.ObjectId, default: null },
    audienceLabel: { type: String, default: null },
  },
  { timestamps: true },
);

templateItemSchema.plugin(softDeletePlugin);
templateItemSchema.plugin(auditPlugin);
templateItemSchema.index({ owner: 1, createdAt: -1 });
templateItemSchema.index({ broadcastId: 1 });

module.exports = mongoose.model('NotificationItem', templateItemSchema);
