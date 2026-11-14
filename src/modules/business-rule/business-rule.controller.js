const asyncHandler = require('../../utils/asyncHandler');
const { ok, created, noContent } = require('../../utils/response');
const service = require('./business-rule.service');

const listCtrl = asyncHandler(async (req, res) => {
  const { items, meta } = await service.listAll(req.query);
  return ok(res, items, 'OK', meta);
});

const getCtrl = asyncHandler(async (req, res) => {
  const item = await service.getById(req.params.id);
  return ok(res, item);
});

const getByCodeCtrl = asyncHandler(async (req, res) => {
  const item = await service.getByCode(req.params.code);
  return ok(res, item);
});

const createCtrl = asyncHandler(async (req, res) => {
  const item = await service.create(req.user.id, req.body);
  return created(res, item, 'Quy tắc mới đã được khởi tạo');
});

const updateCtrl = asyncHandler(async (req, res) => {
  const item = await service.update(req.params.id, req.body, req.user.id);
  return ok(res, item, 'Quy tắc đã được cập nhật thành công');
});

const resetCtrl = asyncHandler(async (req, res) => {
  const item = await service.resetToDefault(req.params.id, req.user.id, req.body?.reason);
  return ok(res, item, 'Quy tắc đã được khôi phục về giá trị mặc định');
});
const historyCtrl = asyncHandler(async (req, res) => {
  const history = await service.getHistory(req.params.id);
  return ok(res, history, 'Lịch sử thay đổi quy tắc');
});
const removeCtrl = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user.id);
  return noContent(res);
});

const exportCtrl = asyncHandler(async (req, res) => {
  const csv = await service.exportRules();
  res.setHeader('Content-Type', 'text/csv; charset=UTF-8');
  res.setHeader('Content-Disposition', 'attachment; filename="business_rules.csv"');
  return res.status(200).send(csv);
});

const simulateCtrl = asyncHandler(async (req, res) => {
  const report = await service.simulate(req.body);
  return ok(res, report, 'Kết quả mô phỏng quy tắc');
});

module.exports = {
  listCtrl,
  getCtrl,
  getByCodeCtrl,
  createCtrl,
  updateCtrl,
  resetCtrl,
  historyCtrl,
  removeCtrl,
  exportCtrl,
  simulateCtrl,
};