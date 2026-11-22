const { ROLES } = require('../../shared/roles');

const ACCESS = Object.freeze({ NONE: 'none', VIEW: 'view', MANAGE: 'manage', OWN: 'own' });

// BRD table 31, grouped by business capability for a readable operational matrix.
const PERMISSION_MATRIX = Object.freeze([
  { module: 'ACC', capability: 'Hồ sơ và thiết lập cá nhân', student: ACCESS.OWN, admin: ACCESS.OWN },
  { module: 'ACC', capability: 'Quản lý tài khoản người dùng', student: ACCESS.NONE, admin: ACCESS.MANAGE },
  { module: 'RBAC', capability: 'Xem vai trò và ma trận quyền', student: ACCESS.NONE, admin: ACCESS.VIEW },
  {
    module: 'RBAC',
    capability: 'Xuất ma trận và xem log từ chối',
    student: ACCESS.NONE,
    admin: ACCESS.MANAGE,
  },
  { module: 'SUB', capability: 'Môn học và tài liệu cá nhân', student: ACCESS.OWN, admin: ACCESS.NONE },
  {
    module: 'SUB',
    capability: 'Danh mục môn và tài liệu dùng chung',
    student: ACCESS.VIEW,
    admin: ACCESS.MANAGE,
  },
  { module: 'KNW', capability: 'Kho tri thức dùng chung', student: ACCESS.VIEW, admin: ACCESS.MANAGE },
  { module: 'QBK', capability: 'Ngân hàng câu hỏi dùng chung', student: ACCESS.VIEW, admin: ACCESS.MANAGE },
  { module: 'ACF', capability: 'Cấu hình đánh giá và rubric', student: ACCESS.NONE, admin: ACCESS.MANAGE },
  { module: 'ASM', capability: 'Bài làm và kết quả cá nhân', student: ACCESS.OWN, admin: ACCESS.NONE },
  { module: 'MST', capability: 'Mức độ thành thạo cá nhân', student: ACCESS.OWN, admin: ACCESS.NONE },
  { module: 'PLN', capability: 'Kế hoạch học tập cá nhân', student: ACCESS.OWN, admin: ACCESS.NONE },
  { module: 'ADP', capability: 'Học tập thích ứng cá nhân', student: ACCESS.OWN, admin: ACCESS.NONE },
  { module: 'REV', capability: 'Ôn tập cá nhân', student: ACCESS.OWN, admin: ACCESS.NONE },
  { module: 'RSK', capability: 'Rủi ro học tập cá nhân', student: ACCESS.OWN, admin: ACCESS.NONE },
  {
    module: 'AIA',
    capability: 'Trợ lý AI trong phạm vi dữ liệu cá nhân',
    student: ACCESS.OWN,
    admin: ACCESS.NONE,
  },
  { module: 'AIC', capability: 'Cấu hình AI dùng chung', student: ACCESS.NONE, admin: ACCESS.MANAGE },
  { module: 'BRL', capability: 'Quy tắc nghiệp vụ dùng chung', student: ACCESS.NONE, admin: ACCESS.MANAGE },
  { module: 'MON', capability: 'Giám sát hệ thống', student: ACCESS.NONE, admin: ACCESS.MANAGE },
  { module: 'DAT', capability: 'Quản trị dữ liệu và lưu giữ', student: ACCESS.NONE, admin: ACCESS.MANAGE },
  { module: 'RPT', capability: 'Báo cáo học tập cá nhân', student: ACCESS.OWN, admin: ACCESS.NONE },
  { module: 'ARP', capability: 'Báo cáo quản trị tổng hợp', student: ACCESS.NONE, admin: ACCESS.VIEW },
  {
    module: 'NTF',
    capability: 'Thông báo cá nhân và cấu hình chung',
    student: ACCESS.OWN,
    admin: ACCESS.MANAGE,
  },
  { module: 'SUP', capability: 'Hỗ trợ và phản hồi', student: ACCESS.OWN, admin: ACCESS.MANAGE },
]);

const ROLE_CATALOG = Object.freeze([
  { code: ROLES.STUDENT, name: 'Sinh viên', description: 'Quản lý dữ liệu học tập thuộc chính tài khoản.' },
  {
    code: ROLES.ADMIN,
    name: 'Quản trị viên',
    description: 'Quản lý tài khoản, nội dung và cấu hình dùng chung; không xem dữ liệu học tập cá nhân.',
  },
]);

function effectivePermissions(role) {
  return PERMISSION_MATRIX.filter((row) => row[role] !== ACCESS.NONE).map((row) => ({
    module: row.module,
    capability: row.capability,
    access: row[role],
  }));
}

module.exports = { ACCESS, PERMISSION_MATRIX, ROLE_CATALOG, effectivePermissions };
