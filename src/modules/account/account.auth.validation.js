const { z } = require('zod');
const { MIN_LENGTH, MAX_LENGTH } = require('./account.password.policy');

const email = z.string().trim().toLowerCase().email();
// Length is checked here; the rest of BR-49 (common passwords, email/name inside) is checked in the service.
const password = z
  .string()
  .min(MIN_LENGTH, `Mật khẩu tối thiểu ${MIN_LENGTH} ký tự`)
  .max(MAX_LENGTH, `Mật khẩu tối đa ${MAX_LENGTH} ký tự`);
const otp = z.string().regex(/^\d{6}$/, 'Mã OTP gồm 6 chữ số');

const registerSchema = z.object({
  email,
  password,
  fullName: z.string().trim().min(1).max(100),
});

const loginSchema = z.object({
  email,
  password: z.string().min(1),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1),
});

const verifyEmailSchema = z.object({ email, otp });

const resendOtpSchema = z.object({
  email,
  purpose: z.enum(['verify', 'reset']).default('verify'),
});

const forgotPasswordSchema = z.object({ email });

const verifyResetOtpSchema = z.object({ email, otp });

const resetPasswordSchema = z.object({
  resetToken: z.string().min(1),
  password,
});

module.exports = {
  registerSchema,
  loginSchema,
  refreshSchema,
  verifyEmailSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  verifyResetOtpSchema,
  resetPasswordSchema,
  passwordField: password,
  emailField: email,
};
