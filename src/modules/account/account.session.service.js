const jwt = require('jsonwebtoken');
const env = require('../../config/env');
const ApiError = require('../../utils/ApiError');
const Session = require('./account.session.model');
const { sha256, safeEqual } = require('./account.crypto');

const msFromExpires = (expires) => {
  const match = /^(\d+)([smhd])$/.exec(expires);
  if (!match) return 7 * 24 * 3600 * 1000;
  const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[match[2]];
  return Number(match[1]) * unit;
};

function signAccess(user, sid) {
  return jwt.sign({ sub: user.id, role: user.role, sid }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES,
  });
}

function signRefresh(user, sid) {
  return jwt.sign({ sub: user.id, role: user.role, sid }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES,
  });
}

/** Creates a session (one per login/device) and returns its token pair. */
async function createSession(user, ctx = {}) {
  const session = await Session.create({
    user: user.id,
    tokenHash: 'pending',
    userAgent: String(ctx.userAgent || '').slice(0, 300),
    ip: ctx.ip || '',
    expiresAt: new Date(Date.now() + msFromExpires(env.JWT_REFRESH_EXPIRES)),
  });
  const refreshToken = signRefresh(user, session.id);
  session.tokenHash = sha256(refreshToken);
  await session.save();
  return { accessToken: signAccess(user, session.id), refreshToken, sessionId: session.id };
}

/** Validates a refresh token against its session and rotates it. */
async function rotateSession(refreshToken, loadUser) {
  let payload;
  try {
    payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw ApiError.unauthorized('Invalid or expired refresh token');
  }
  const session = payload.sid ? await Session.findById(payload.sid) : null;
  if (!session || !safeEqual(session.tokenHash, sha256(refreshToken))) {
    throw ApiError.unauthorized('Session not found');
  }
  const user = await loadUser(payload.sub);
  if (!user || !user.isActive) {
    await session.deleteOne();
    throw ApiError.unauthorized('Session not found');
  }
  const newRefresh = signRefresh(user, session.id);
  session.tokenHash = sha256(newRefresh);
  session.lastUsedAt = new Date();
  session.expiresAt = new Date(Date.now() + msFromExpires(env.JWT_REFRESH_EXPIRES));
  await session.save();
  return { accessToken: signAccess(user, session.id), refreshToken: newRefresh };
}

/** Ends the session a refresh token belongs to. Silently ignores unknown/expired tokens (idempotent logout). */
async function endSessionByRefreshToken(refreshToken) {
  try {
    const payload = jwt.verify(refreshToken, env.JWT_REFRESH_SECRET);
    if (payload.sid) await Session.deleteOne({ _id: payload.sid, user: payload.sub });
  } catch (err) {
    // already invalid — nothing to end
  }
}

/** Revokes every session of a user, optionally keeping one (BR-49: password change logs out other sessions). */
const revokeAllSessions = (userId, exceptSid = null) =>
  Session.deleteMany({ user: userId, ...(exceptSid ? { _id: { $ne: exceptSid } } : {}) });

module.exports = { createSession, rotateSession, endSessionByRefreshToken, revokeAllSessions };
