// Single source of truth for roles (BRD 2.3: only STUDENT and ADMIN are login roles; SYS is automated, not a session).
const ROLES = Object.freeze({
  STUDENT: 'student',
  ADMIN: 'admin',
});

module.exports = { ROLES };
