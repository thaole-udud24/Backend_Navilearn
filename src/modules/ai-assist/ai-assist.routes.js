const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const {
  generateQuestionSchema,
  listQuerySchema,
  idParamsSchema,
  askSchema,
  explainWrongSchema,
  essayFeedbackSchema,
  rateSchema,
  reportSchema,
  generatePlanSchema,
  generateConceptSchema,
  generateTemplateSchema,
} = require('./ai-assist.validation');
const ctrl = require('./ai-assist.controller');

const router = express.Router();

router.use(authenticate);

// UC-QBK-09 source: admin-only draft generation for the shared bank.
router.post(
  '/generate-question',
  authorize(ROLES.ADMIN),
  validate(generateQuestionSchema),
  ctrl.generateQuestionCtrl,
);

// UC-KNW-AI-01: admin-only draft generation for the knowledge map.
router.post(
  '/generate-concept',
  authorize(ROLES.ADMIN),
  validate(generateConceptSchema),
  ctrl.generateConceptCtrl,
);

// UC-PLN-TPL-04: admin-only draft generation for a whole plan template.
router.post(
  '/generate-template',
  authorize(ROLES.ADMIN),
  validate(generateTemplateSchema),
  ctrl.generateTemplateCtrl,
);

// Student-facing AI assistance (UC-AIA-01..13): own interaction log only.
router.post(
  '/practice-question',
  authorize(ROLES.STUDENT),
  validate(generateQuestionSchema),
  ctrl.practiceQuestionCtrl,
);
router.post('/ask', authorize(ROLES.STUDENT), validate(askSchema), ctrl.askCtrl);
router.post('/explain-wrong', authorize(ROLES.STUDENT), validate(explainWrongSchema), ctrl.explainWrongCtrl);
router.post(
  '/essay-feedback',
  authorize(ROLES.STUDENT),
  validate(essayFeedbackSchema),
  ctrl.essayFeedbackCtrl,
);
router.post('/generate-plan', authorize(ROLES.STUDENT), validate(generatePlanSchema), ctrl.generatePlanCtrl);

// B6 "Giám sát" (admin-only ops overview): placed before '/:id' only for readability — the two
// path segments never collide with that single-segment param route.
router.get('/admin/overview', authorize(ROLES.ADMIN), ctrl.adminOverviewCtrl);

// A5 "Review Workspace": pending AI-generated question drafts + reject action. Placed before '/:id'
// for the same reason as '/admin/overview' above.
router.get('/admin/question-drafts', authorize(ROLES.ADMIN), validate(listQuerySchema, 'query'), ctrl.listQuestionDraftsCtrl);
router.post(
  '/admin/question-drafts/:id/reject',
  authorize(ROLES.ADMIN),
  validate(idParamsSchema, 'params'),
  ctrl.rejectQuestionDraftCtrl,
);

router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.delete('/:id', authorize(ROLES.STUDENT), validate(idParamsSchema, 'params'), ctrl.removeCtrl);
router.post(
  '/:id/rate',
  authorize(ROLES.STUDENT),
  validate(idParamsSchema, 'params'),
  validate(rateSchema),
  ctrl.rateCtrl,
);
router.post(
  '/:id/report',
  authorize(ROLES.STUDENT),
  validate(idParamsSchema, 'params'),
  validate(reportSchema),
  ctrl.reportCtrl,
);

module.exports = router;
