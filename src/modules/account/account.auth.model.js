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
