const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const User = require('./account.auth.model');

function signTokens(user) {
  const payload = { sub: user.id, role: user.role };
  const accessToken = jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: env.JWT_ACCESS_EXPIRES });
  const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: env.JWT_REFRESH_EXPIRES });
  return { accessToken, refreshToken };
}

function toPublicUser(user) {
  return { id: user.id, email: user.email, fullName: user.fullName, role: user.role };
}

async function register({ email, password, fullName }) {
  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('Email already registered', 'EMAIL_EXISTS');

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await User.create({ email, passwordHash, fullName });
  const tokens = signTokens(user);
  user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
  await user.save();
  return { user: toPublicUser(user), ...tokens };
}

async function login({ email, password }) {
  const user = await User.findOne({ email });
  if (!user || !user.isActive) throw ApiError.unauthorized('Invalid email or password');

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) throw ApiError.unauthorized('Invalid email or password');

  const tokens = signTokens(user);
  user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
  await user.save();
  return { user: toPublicUser(user), ...tokens };
}

async function refresh({ refreshToken }) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.refreshTokenHash) throw ApiError.unauthorized('Session not found');

  const match = await bcrypt.compare(refreshToken, user.refreshTokenHash);
  if (!match) throw ApiError.unauthorized('Refresh token does not match');

  const tokens = signTokens(user);
  user.refreshTokenHash = await bcrypt.hash(tokens.refreshToken, 10);
  await user.save();
  return tokens;
}

async function me(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return toPublicUser(user);
}

module.exports = { register, login, refresh, me };
