const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const {
  subjectQuerySchema,
  volumeQuerySchema,
  topMissedQuerySchema,
  exportQuerySchema,
} = require('./admin-insights.validation');
const ctrl = require('./admin-insights.controller');

// Cross-student report dashboard (B7 "Báo cáo") — admin only, read-only aggregates over existing
// collections (mastery, assessment, wrong-item, knowledge). No model of its own.
const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));

// Literal path before any future '/:id' so it is never captured by a param route.
router.get('/export', validate(exportQuerySchema, 'query'), ctrl.exportCtrl);
router.get('/subjects', ctrl.subjectsCtrl);
router.get('/learning-effectiveness', validate(subjectQuerySchema, 'query'), ctrl.learningEffectivenessCtrl);
router.get('/volume', validate(volumeQuerySchema, 'query'), ctrl.volumeCtrl);
router.get('/top-missed-questions', validate(topMissedQuerySchema, 'query'), ctrl.topMissedCtrl);

module.exports = router;
