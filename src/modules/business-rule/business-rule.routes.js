const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const {
  createRuleSchema,
  updateRuleSchema,
  resetRuleSchema,
  listQuerySchema,
  idParamsSchema,
  simulateRuleSchema,
} = require('./business-rule.validation');

const ctrl = require('./business-rule.controller');

const router = express.Router();

router.use(authenticate);

router.get('/export', authorize(ROLES.ADMIN), ctrl.exportCtrl);
router.post('/simulate', authorize(ROLES.ADMIN), validate(simulateRuleSchema), ctrl.simulateCtrl);

// Xem danh sách quy tắc nghiệp vụ
router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);

// Lấy quy tắc theo mã
router.get('/code/:code', ctrl.getByCodeCtrl);

// Xem chi tiết một quy tắc
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);

// Xem lịch sử thay đổi quy tắc
router.get('/:id/history', authorize(ROLES.ADMIN), validate(idParamsSchema, 'params'), ctrl.historyCtrl);

// Khởi tạo quy tắc mới 
router.post('/', authorize(ROLES.ADMIN), validate(createRuleSchema), ctrl.createCtrl);

// Cấu hình quy tắc nghiệp vụ và ngưỡng
router.patch(
  '/:id',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(updateRuleSchema),
  ctrl.updateCtrl,
);

// Khôi phục quy tắc về giá trị mặc định 
router.post(
  '/:id/reset',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(resetRuleSchema),
  ctrl.resetCtrl,
);

// Xóa quy tắc
router.delete('/:id', authorize(ROLES.ADMIN), validate(idParamsSchema, 'params'), ctrl.removeCtrl);

module.exports = router;