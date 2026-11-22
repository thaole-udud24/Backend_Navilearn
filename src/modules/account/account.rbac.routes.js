const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const { roleQuerySchema, accountIdParamsSchema, deniedLogQuerySchema } = require('./account.rbac.validation');
const ctrl = require('./account.rbac.controller');

const router = express.Router();

router.use(authenticate);
router.use(authorize(ROLES.ADMIN));

// UC-RBAC-01: danh sách vai trò
router.get('/roles', ctrl.rolesCtrl);

// UC-RBAC-02: ma trận phân quyền chức năng
router.get('/matrix', validate(roleQuerySchema, 'query'), ctrl.matrixCtrl);

// UC-RBAC-04: xuất ma trận phân quyền
router.get('/matrix/export', validate(roleQuerySchema, 'query'), ctrl.exportCtrl);

// UC-RBAC-03: quyền hiệu lực của một tài khoản
router.get('/accounts/:accountId/effective', validate(accountIdParamsSchema, 'params'), ctrl.effectiveCtrl);

// UC-RBAC-05: nhật ký truy cập bị từ chối
router.get('/denied-access-log', validate(deniedLogQuerySchema, 'query'), ctrl.deniedLogCtrl);

module.exports = router;
