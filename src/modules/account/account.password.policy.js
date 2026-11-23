const ApiError = require('../../utils/ApiError');

// BR-49 (NIST SP 800-63B): length 8..64, any printable char, no composition rules, no common/leaked passwords,
// must not contain the account email or full name.
const MIN_LENGTH = 8;
const MAX_LENGTH = 64;

// Small built-in blocklist of the most common passwords. Swap for a larger/breach list when one is available.
const COMMON_PASSWORDS = new Set([
  '12345678',
  '123456789',
  '1234567890',
  '123123123',
  '111111111',
  '11111111',
  '00000000',
  '87654321',
  'password',
  'password1',
  'password12',
  'password123',
  'password1234',
  'passw0rd',
  'p@ssw0rd',
  'p@ssword',
  'qwertyui',
  'qwerty123',
  'qwertyuiop',
  'qwerty12345',
  'qwertyuiop123',
  'asdfghjk',
  'asdfghjkl',
  'zxcvbnm1',
  'iloveyou',
  'iloveyou1',
  'letmein1',
  'welcome1',
  'welcome123',
  'admin123',
  'admin1234',
  'administrator',
  'abc12345',
  'abcd1234',
  'abcdefgh',
  'abcd12345',
  'monkey123',
  'dragon123',
  'football1',
  'baseball1',
  'sunshine1',
  'princess1',
  'superman1',
  'master123',
  'login123',
  'changeme',
  'changeme1',
  'trustno1',
  'matkhau123',
  'matkhau1234',
  'sinhvien123',
  'sinhvien1',
  'navilearn',
  'navilearn123',
  'navilearn1',
  '1q2w3e4r',
  '1q2w3e4r5t',
  '1qaz2wsx',
  'q1w2e3r4',
  'a1234567',
  'aa123456',
  'a12345678',
  'abc123456',
]);

function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase();
}

/** Returns an error message (string) when the password violates BR-49, otherwise null. */
function checkPassword(password, { email, fullName } = {}) {
  if (typeof password !== 'string') return 'Mật khẩu không hợp lệ';
  if (password.length < MIN_LENGTH) return `Mật khẩu tối thiểu ${MIN_LENGTH} ký tự`;
  if (password.length > MAX_LENGTH) return `Mật khẩu tối đa ${MAX_LENGTH} ký tự`;

  const lower = normalize(password);
  if (COMMON_PASSWORDS.has(lower)) return 'Mật khẩu quá phổ biến, vui lòng chọn mật khẩu khác';

  if (email) {
    const mail = normalize(email);
    const local = mail.split('@')[0];
    if (lower.includes(mail) || (local.length >= 4 && lower.includes(local))) {
      return 'Mật khẩu không được chứa email của tài khoản';
    }
  }
  if (fullName) {
    const name = normalize(fullName).replace(/\s+/g, '');
    if (name.length >= 4 && lower.replace(/\s+/g, '').includes(name)) {
      return 'Mật khẩu không được chứa họ tên của tài khoản';
    }
  }
  return null;
}

/** Throws a 400 WEAK_PASSWORD ApiError when the password violates BR-49. */
function assertPassword(password, context) {
  const message = checkPassword(password, context);
  if (message) throw ApiError.badRequest(message, 'WEAK_PASSWORD', [{ field: 'password', message }]);
}

module.exports = { checkPassword, assertPassword, MIN_LENGTH, MAX_LENGTH };
