const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const v = require('./account.admin.validation');
const ctrl = require('./account.admin.controller');

// Mounted at /admin: user management (BIZ-ACC-02..12) and the admin audit log (BR-29). ADMIN only.
const router = express.Router();
const idParams = validate(v.idParamsSchema, 'params');

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/users', validate(v.listQuerySchema, 'query'), ctrl.listCtrl);
router.get('/users/export', validate(v.listQuerySchema, 'query'), ctrl.exportCtrl);
router.post('/users', validate(v.createUserSchema), ctrl.createCtrl);
router.get('/users/:id', idParams, ctrl.getCtrl);
router.patch('/users/:id', idParams, validate(v.updateUserSchema), ctrl.updateCtrl);
router.post('/users/:id/lock', idParams, validate(v.lockSchema), ctrl.lockCtrl);
router.post('/users/:id/unlock', idParams, ctrl.unlockCtrl);
router.post('/users/:id/send-reset', idParams, ctrl.sendResetCtrl);
router.get('/users/:id/login-logs', idParams, validate(v.listQuerySchema, 'query'), ctrl.loginLogsCtrl);
router.delete('/users/:id', idParams, ctrl.removeCtrl);
router.get('/audit-logs', validate(v.auditQuerySchema, 'query'), ctrl.auditLogsCtrl);

module.exports = router;
