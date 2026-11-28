const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const { staleQuerySchema, exportStudentQuerySchema, activityQuerySchema } = require('./admin-data.validation');
const ctrl = require('./admin-data.controller');

// Data retention dashboard (B8 "Dữ liệu") — admin only, read-only. Per NaviLearn_01 §2 ("không xóa
// cứng nội dung đã có người dùng — chuyển ARCHIVED/INACTIVE"), this module never exposes a hard or
// bulk delete: it reports on the soft-delete state collections already carry and exports live data.
const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

router.get('/retention-stats', ctrl.retentionStatsCtrl);
router.get('/stale-records', validate(staleQuerySchema, 'query'), ctrl.staleRecordsCtrl);
router.get('/export-student', validate(exportStudentQuerySchema, 'query'), ctrl.exportStudentCtrl);
router.get('/activity-log', validate(activityQuerySchema, 'query'), ctrl.activityLogCtrl);

module.exports = router;
