// Chay 1 lan de tao tai khoan admin dau tien, bo qua buoc xac minh OTP qua email.
// Usage: node scripts/seed-admin.js <email> <password> <fullName>
require('dotenv').config();
const bcrypt = require('bcryptjs');
const { connectDB, disconnectDB } = require('../src/config/db');
const User = require('../src/modules/account/account.auth.model');
const { ROLES } = require('../src/shared/roles');

async function main() {
  const [email = 'admin@navilearn.local', password = 'Admin@123', fullName = 'Admin NaviLearn'] = process.argv.slice(2);

  await connectDB();

  const existing = await User.findOne({ email });
  if (existing) {
    existing.role = ROLES.ADMIN;
    existing.isActive = true;
    existing.emailVerified = true;
    existing.passwordHash = await bcrypt.hash(password, 10);
    await existing.save();
    console.log('Da cap nhat tai khoan admin:', email);
  } else {
    await User.create({
      email,
      passwordHash: await bcrypt.hash(password, 10),
      fullName,
      role: ROLES.ADMIN,
      isActive: true,
      emailVerified: true,
    });
    console.log('Da tao tai khoan admin moi:', email);
  }

  console.log('Email:', email);
  console.log('Password:', password);

  await disconnectDB();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
