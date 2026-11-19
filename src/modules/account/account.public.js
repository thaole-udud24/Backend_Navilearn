const toPublicUser = (user) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: user.role,
  avatarUrl: user.avatarUrl || null,
});

const toProfile = (user) => ({
  ...toPublicUser(user),
  emailVerified: user.emailVerified,
  locale: user.locale,
  timezone: user.timezone,
  learningGoal: user.learningGoal || '',
  availability: {
    mon: user.availability?.mon ?? 0,
    tue: user.availability?.tue ?? 0,
    wed: user.availability?.wed ?? 0,
    thu: user.availability?.thu ?? 0,
    fri: user.availability?.fri ?? 0,
    sat: user.availability?.sat ?? 0,
    sun: user.availability?.sun ?? 0,
  },
  createdAt: user.createdAt,
});

// Account fields an ADMIN may see (BR-02: never learning data).
const toAdminUser = (user) => ({
  id: user.id,
  email: user.email,
  fullName: user.fullName,
  role: user.role,
  isActive: user.isActive,
  emailVerified: user.emailVerified,
  lockReason: user.lockReason || null,
  lockedAt: user.lockedAt || null,
  lastLoginAt: user.lastLoginAt || null,
  createdAt: user.createdAt,
});

module.exports = { toPublicUser, toProfile, toAdminUser };
