// Tao/cap nhat 2 tai khoan test co mat khau biet truoc, de dang nhap thu ngay: 1 admin + 1 hoc sinh.
// Usage: node scripts/seed-test-accounts.js
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/modules/account/account.auth.model');
const { ROLES } = require('../src/shared/roles');

const ACCOUNTS = [
  { email: 'admin@navilearn.local', password: 'Admin@123', fullName: 'Admin NaviLearn', role: ROLES.ADMIN },
  { email: 'student@navilearn.local', password: 'Student@123', fullName: 'Học sinh Test', role: ROLES.STUDENT },
];

async function main() {
  await connectDB();

  for (const acc of ACCOUNTS) {
    const passwordHash = await bcrypt.hash(acc.password, 10);
    // eslint-disable-next-line no-await-in-loop
    await User.findOneAndUpdate(
      { email: acc.email },
      { email: acc.email, passwordHash, fullName: acc.fullName, role: acc.role, isActive: true, emailVerified: true },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    console.log(`Da san sang tai khoan ${acc.role}: ${acc.email} / ${acc.password}`);
  }

  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
