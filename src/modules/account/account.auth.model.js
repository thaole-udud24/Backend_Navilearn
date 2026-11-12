const mongoose = require('mongoose');
const { ROLES } = require('../../shared/roles');

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    fullName: { type: String, required: true, trim: true },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.STUDENT },
    refreshTokenHash: { type: String, default: null },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model('User', userSchema);
