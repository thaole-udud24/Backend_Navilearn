const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const { sendMail } = require('../../integrations/mailer');
const Token = require('./account.token.model');
const { generateOtp, generateOpaqueToken, sha256, safeEqual } = require('./account.crypto');

const { TOKEN_TYPES } = Token;
const MAX_OTP_ATTEMPTS = 5;
const RESET_TICKET_MINUTES = 15;

const otpHash = (userId, otp) => sha256(`${userId}:${otp}`);
const minutesFromNow = (m) => new Date(Date.now() + m * 60 * 1000);

/** Creates a fresh 6-digit OTP (replacing any older one of the same type) and returns the plain code. */
async function issueOtp(user, type, { enforceCooldown = true } = {}) {
  if (enforceCooldown) {
    const last = await Token.findOne({ user: user.id, type }).sort({ createdAt: -1 });
    if (last && Date.now() - last.createdAt.getTime() < env.OTP_RESEND_SECONDS * 1000) {
      throw new ApiError(429, `Vui lòng đợi ${env.OTP_RESEND_SECONDS} giây trước khi yêu cầu mã mới`, 'OTP_COOLDOWN');
    }
  }
  await Token.deleteMany({ user: user.id, type });
  const otp = generateOtp();
  await Token.create({
    user: user.id,
    type,
    tokenHash: otpHash(user.id, otp),
    expiresAt: minutesFromNow(env.OTP_EXPIRES_MINUTES),
  });
  return otp;
}

/** Checks the OTP and consumes it. Wrong/expired/too many attempts all give the same OTP_INVALID error. */
async function consumeOtp(user, type, otp) {
  const invalid = () => ApiError.badRequest('Mã OTP không hợp lệ hoặc đã hết hạn', 'OTP_INVALID');
  const token = user ? await Token.findOne({ user: user.id, type }) : null;
  if (!token || token.expiresAt.getTime() <= Date.now()) throw invalid();
  if (token.attempts >= MAX_OTP_ATTEMPTS) {
    await token.deleteOne();
    throw invalid();
  }
  if (!safeEqual(token.tokenHash, otpHash(user.id, otp))) {
    token.attempts += 1;
    await token.save();
    throw invalid();
  }
  await token.deleteOne();
}

/** One-time ticket that allows exactly one password reset. Returns the plain token. */
async function issueResetTicket(user, minutes = RESET_TICKET_MINUTES) {
  await Token.deleteMany({ user: user.id, type: TOKEN_TYPES.RESET_TICKET });
  const plain = generateOpaqueToken();
  await Token.create({
    user: user.id,
    type: TOKEN_TYPES.RESET_TICKET,
    tokenHash: sha256(plain),
    expiresAt: minutesFromNow(minutes),
  });
  return plain;
}

/** Finds and consumes a reset ticket; returns the owning userId. */
async function consumeResetTicket(plain) {
  const invalid = () => ApiError.badRequest('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn', 'RESET_TOKEN_INVALID');
  const token = await Token.findOne({ type: TOKEN_TYPES.RESET_TICKET, tokenHash: sha256(plain) });
  if (!token || token.expiresAt.getTime() <= Date.now()) throw invalid();
  await token.deleteOne();
  return String(token.user);
}

function sendOtpMail(user, type, otp) {
  const isReset = type === TOKEN_TYPES.RESET_OTP;
  return sendMail({
    to: user.email,
    subject: isReset ? 'NaviLearn - Mã đặt lại mật khẩu' : 'NaviLearn - Mã xác minh email',
    text: `Xin chào ${user.fullName},\n\nMã ${isReset ? 'đặt lại mật khẩu' : 'xác minh email'} của bạn là: ${otp}\nMã có hiệu lực trong ${env.OTP_EXPIRES_MINUTES} phút. Không chia sẻ mã này với bất kỳ ai.\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
  });
}

function sendResetLinkMail(user, ticket, minutes) {
  const link = `${env.FRONTEND_URL.replace(/\/$/, '')}/login?resetToken=${ticket}`;
  return sendMail({
    to: user.email,
    subject: 'NaviLearn - Đặt lại mật khẩu',
    text: `Xin chào ${user.fullName},\n\nQuản trị viên đã gửi cho bạn liên kết đặt lại mật khẩu (hiệu lực ${minutes} phút):\n${link}\n\nNếu bạn không yêu cầu, hãy bỏ qua email này.`,
  });
}

module.exports = {
  TOKEN_TYPES,
  issueOtp,
  consumeOtp,
  issueResetTicket,
  consumeResetTicket,
  sendOtpMail,
  sendResetLinkMail,
};
