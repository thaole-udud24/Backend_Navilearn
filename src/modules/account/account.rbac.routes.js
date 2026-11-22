const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const v = require('./account.rbac.validation');
const ctrl = require('./account.rbac.controller');

const router = express.Router();
router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/roles', ctrl.rolesCtrl);
router.get('/matrix/export', validate(v.exportQuerySchema, 'query'), ctrl.exportCtrl);
router.get('/matrix', validate(v.matrixQuerySchema, 'query'), ctrl.matrixCtrl);
router.get('/effective/:userId', validate(v.userParamsSchema, 'params'), ctrl.effectiveCtrl);
router.get('/denied-logs', validate(v.deniedQuerySchema, 'query'), ctrl.deniedLogsCtrl);

module.exports = router;
