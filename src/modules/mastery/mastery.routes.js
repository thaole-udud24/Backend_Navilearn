const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const {
  listQuerySchema,
  idParamsSchema,
  trendQuerySchema,
  setGoalSchema,
  markContentCompleteSchema,
  exportQuerySchema,
} = require('./mastery.validation');
const ctrl = require('./mastery.controller');

const router = express.Router();

// Personal learning data (BR-02/BR-35): student-only, no admin read; writes are narrow (goal,
// content-complete) — the mastery score itself is still derived only by grading.
router.use(authenticate, authorize(ROLES.STUDENT));
router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.get('/export', validate(exportQuerySchema, 'query'), ctrl.exportReportCtrl);
router.post('/complete', validate(markContentCompleteSchema), ctrl.markContentCompleteCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.get(
  '/:id/trend',
  validate(idParamsSchema, 'params'),
  validate(trendQuerySchema, 'query'),
  ctrl.getTrendCtrl,
);
router.patch('/:id/goal', validate(idParamsSchema, 'params'), validate(setGoalSchema), ctrl.setGoalCtrl);

module.exports = router;
