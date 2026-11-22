const { ROLES } = require('./roles');

// UC-RBAC-02: static permission matrix per BR-01 (truy cập dữ liệu theo vai trò) - derived from how
// each module's routes.js actually gates access (authenticate + authorize(ROLES.ADMIN) per route).
// STUDENT access is always scoped to the caller's own records; ADMIN access is full management.
const PERMISSION_MATRIX = [
  { module: 'ACC', name: 'Tài khoản & hồ sơ', roles: { [ROLES.STUDENT]: 'Hồ sơ/thiết lập của chính mình', [ROLES.ADMIN]: 'Quản lý toàn bộ tài khoản' } },
  { module: 'RBAC', name: 'Vai trò & phân quyền', roles: { [ROLES.STUDENT]: 'Không có quyền truy cập', [ROLES.ADMIN]: 'Xem danh mục vai trò, ma trận quyền, nhật ký truy cập bị từ chối' } },
  { module: 'SUB', name: 'Môn học', roles: { [ROLES.STUDENT]: 'Xem/đăng ký môn học', [ROLES.ADMIN]: 'Quản lý danh mục môn học' } },
  { module: 'KNW', name: 'Kiến thức', roles: { [ROLES.STUDENT]: 'Xem nội dung kiến thức', [ROLES.ADMIN]: 'Quản lý CRUD kiến thức' } },
  { module: 'ASM', name: 'Làm bài đánh giá', roles: { [ROLES.STUDENT]: 'Làm bài, xem kết quả của chính mình', [ROLES.ADMIN]: 'Quản lý/giám sát bài làm' } },
  { module: 'QBK', name: 'Ngân hàng câu hỏi', roles: { [ROLES.STUDENT]: 'Xem/luyện tập câu hỏi', [ROLES.ADMIN]: 'Quản lý CRUD câu hỏi, duyệt/báo lỗi' } },
  { module: 'ACF', name: 'Cấu hình bài đánh giá', roles: { [ROLES.STUDENT]: 'Không có quyền truy cập', [ROLES.ADMIN]: 'Quản lý cấu hình đề thi/rubric' } },
  { module: 'MST', name: 'Mastery & Learning State', roles: { [ROLES.STUDENT]: 'Xem Mastery của chính mình', [ROLES.ADMIN]: 'Xem báo cáo tổng hợp (ẩn danh)' } },
  { module: 'AIA', name: 'Trợ lý AI', roles: { [ROLES.STUDENT]: 'Hỏi đáp, luyện tập cùng AI', [ROLES.ADMIN]: 'Cấu hình/giám sát AI, duyệt nhật ký' } },
  { module: 'AIC', name: 'Cấu hình AI', roles: { [ROLES.STUDENT]: 'Không có quyền truy cập', [ROLES.ADMIN]: 'Cấu hình nhà cung cấp/mô hình AI' } },
  { module: 'BRL', name: 'Quy tắc nghiệp vụ', roles: { [ROLES.STUDENT]: 'Không có quyền truy cập', [ROLES.ADMIN]: 'Xem/sửa/đặt lại/giả lập quy tắc' } },
  { module: 'PLN', name: 'Kế hoạch học tập', roles: { [ROLES.STUDENT]: 'Xem/điều chỉnh kế hoạch của chính mình', [ROLES.ADMIN]: 'Không can thiệp kế hoạch cá nhân (BR-02)' } },
  { module: 'ADP', name: 'Adaptive Engine', roles: { [ROLES.STUDENT]: 'Nhận đề xuất Next Best Action', [ROLES.ADMIN]: 'Cấu hình trọng số thuật toán (qua BRL)' } },
  { module: 'REV', name: 'Ôn tập ngắt quãng', roles: { [ROLES.STUDENT]: 'Xem/thực hiện lịch ôn tập của chính mình', [ROLES.ADMIN]: 'Không can thiệp dữ liệu cá nhân' } },
  { module: 'RSK', name: 'Phát hiện rủi ro', roles: { [ROLES.STUDENT]: 'Xem cảnh báo rủi ro của chính mình', [ROLES.ADMIN]: 'Xem tổng hợp rủi ro toàn hệ thống' } },
  { module: 'RPT', name: 'Báo cáo sinh viên', roles: { [ROLES.STUDENT]: 'Xem báo cáo của chính mình', [ROLES.ADMIN]: 'Không truy cập nội dung cá nhân (BR-31)' } },
  { module: 'ARP', name: 'Báo cáo quản trị', roles: { [ROLES.STUDENT]: 'Không có quyền truy cập', [ROLES.ADMIN]: 'Xem báo cáo tổng hợp toàn hệ thống' } },
  { module: 'MON', name: 'Giám sát hệ thống', roles: { [ROLES.STUDENT]: 'Không có quyền truy cập', [ROLES.ADMIN]: 'Dashboard, hiệu năng, nhật ký, cảnh báo' } },
  { module: 'DAT', name: 'Lưu trữ & xoá dữ liệu', roles: { [ROLES.STUDENT]: 'Yêu cầu xuất/xoá dữ liệu của chính mình', [ROLES.ADMIN]: 'Xử lý yêu cầu, chính sách lưu trữ' } },
  { module: 'NTF', name: 'Thông báo', roles: { [ROLES.STUDENT]: 'Xem thông báo của chính mình', [ROLES.ADMIN]: 'Gửi/quản lý thông báo hệ thống' } },
  { module: 'SUP', name: 'Hỗ trợ', roles: { [ROLES.STUDENT]: 'Tạo/xem yêu cầu hỗ trợ của chính mình', [ROLES.ADMIN]: 'Xử lý yêu cầu hỗ trợ' } },
];

module.exports = { PERMISSION_MATRIX };
