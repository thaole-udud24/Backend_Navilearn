const mongoose = require('mongoose');

const TOKEN_TYPES = Object.freeze({
  VERIFY_EMAIL: 'verify_email', // 6-digit OTP sent after register
  RESET_OTP: 'reset_password', // 6-digit OTP sent by "forgot password"
  RESET_TICKET: 'reset_ticket', // opaque token that allows exactly one password reset
});

const tokenSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: Object.values(TOKEN_TYPES), required: true },
    tokenHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
tokenSchema.index({ user: 1, type: 1 });

const Token = mongoose.model('AuthToken', tokenSchema);
Token.TOKEN_TYPES = TOKEN_TYPES;

module.exports = Token;
