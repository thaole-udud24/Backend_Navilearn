const mongoose = require('mongoose');
const { ROLES } = require('../../shared/roles');

const dayMinutes = { type: Number, default: 0, min: 0, max: 1440 };

// BR-56: profile + study settings. `availability` = available study minutes per weekday (input of the study plan).
const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    fullName: { type: String, required: true, trim: true },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.STUDENT },

    // Account state. isActive=false means locked by an ADMIN (lockReason is mandatory then).
    isActive: { type: Boolean, default: true },
    lockReason: { type: String, default: null },
    lockedAt: { type: Date, default: null },
    emailVerified: { type: Boolean, default: false },

    // BR-46: temporary lock after too many wrong passwords.
    failedAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },

    avatarUrl: { type: String, default: null },
    locale: { type: String, enum: ['vi', 'en'], default: 'vi' },
    timezone: { type: String, default: 'Asia/Ho_Chi_Minh' },
    learningGoal: { type: String, trim: true, maxlength: 500, default: '' },
    // N14 "Nhắc học": student-level DEFAULTS only (giờ nhắc + ngày nghỉ mặc định) — no reminder
    // SENDING mechanism here (out of scope); the goal wizard can read these as sensible defaults
    // in a future enhancement, same shape as PlanningGoal.restDays (0=Sunday..6=Saturday, Date#getDay()).
    notificationHour: { type: Number, min: 0, max: 23, default: 20 },
    defaultRestDays: { type: [Number], default: [] },
    // v2.1 §5.9: Chuỗi ngày học (Streak) — tăng khi sinh viên hoàn thành nhiệm vụ/bài học trong ngày.
    streak: {
      current: { type: Number, default: 0, min: 0 },
      longest: { type: Number, default: 0, min: 0 },
      lastActiveDate: { type: String, default: null },
    },
    badges: {
      type: [
        {
          code: { type: String, required: true },
          name: { type: String, required: true },
          thresholdDays: { type: Number, required: true },
          earnedAt: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    availability: {
      mon: dayMinutes,
      tue: dayMinutes,
      wed: dayMinutes,
      thu: dayMinutes,
      fri: dayMinutes,
      sat: dayMinutes,
      sun: dayMinutes,
    },
  },
  { timestamps: true },
);

userSchema.index({ role: 1, isActive: 1 });

module.exports = mongoose.model('User', userSchema);
