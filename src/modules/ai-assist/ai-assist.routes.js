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
