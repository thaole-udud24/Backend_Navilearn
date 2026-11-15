const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const {
  createSchema,
  updateSchema,
  updateStatusSchema,
  listQuerySchema,
  idParamsSchema,
  importSchema,
  exportQuerySchema,
  fromAiDraftSchema,
  reportIssueSchema,
  issueReportListQuerySchema,
  resolveIssueReportSchema,
  qualityStatsQuerySchema,
  duplicatesQuerySchema,
} = require('./question-bank.validation');
const ctrl = require('./question-bank.controller');

const router = express.Router();

router.use(authenticate);

// Literal paths must come before '/:id' so they are not swallowed by the id param route.
router.get('/export', authorize(ROLES.ADMIN), validate(exportQuerySchema, 'query'), ctrl.exportCtrl);
router.post('/import', authorize(ROLES.ADMIN), validate(importSchema), ctrl.importCtrl);
router.post('/from-ai-draft', authorize(ROLES.ADMIN), validate(fromAiDraftSchema), ctrl.fromAiDraftCtrl);
router.get(
  '/quality-stats',
  authorize(ROLES.ADMIN),
  validate(qualityStatsQuerySchema, 'query'),
  ctrl.qualityStatsCtrl,
);
router.get(
  '/duplicates',
  authorize(ROLES.ADMIN),
  validate(duplicatesQuerySchema, 'query'),
  ctrl.duplicatesCtrl,
);
router.get(
  '/issue-reports',
  authorize(ROLES.ADMIN),
  validate(issueReportListQuerySchema, 'query'),
  ctrl.listIssueReportsCtrl,
);
router.patch(
  '/issue-reports/:id',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(resolveIssueReportSchema),
  ctrl.resolveIssueReportCtrl,
);

router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.post('/', authorize(ROLES.ADMIN), validate(createSchema), ctrl.createCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.patch(
  '/:id',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(updateSchema),
  ctrl.updateCtrl,
);
router.post('/:id/duplicate', authorize(ROLES.ADMIN), validate(idParamsSchema, 'params'), ctrl.duplicateCtrl);
router.patch(
  '/:id/status',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  validate(updateStatusSchema),
  ctrl.updateStatusCtrl,
);
router.post(
  '/:id/report',
  authorize(ROLES.STUDENT),
  validate(idParamsSchema, 'params'),
  validate(reportIssueSchema),
  ctrl.reportIssueCtrl,
);
router.get(
  '/:id/regrade-impact',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  ctrl.regradeImpactCtrl,
);
router.post(
  '/:id/confirm-regrade',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  ctrl.confirmRegradeCtrl,
);
router.delete('/:id', authorize(ROLES.ADMIN), validate(idParamsSchema, 'params'), ctrl.removeCtrl);

module.exports = router;
