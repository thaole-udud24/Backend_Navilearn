const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const {
  startSchema,
  submitSchema,
  draftSchema,
  flagSchema,
  listQuerySchema,
  idParamsSchema,
  compareQuerySchema,
  retryWrongSchema,
  independentCheckSchema,
} = require('./assessment.validation');
const ctrl = require('./assessment.controller');

const router = express.Router();

// Personal learning data (BR-02/BR-35): student-only, no admin read.
router.use(authenticate, authorize(ROLES.STUDENT));

// Literal paths before '/:id' so they are not swallowed by the id param route.
router.get('/compare', validate(compareQuerySchema, 'query'), ctrl.compareCtrl);
router.post('/retry-wrong', validate(retryWrongSchema), ctrl.retryWrongCtrl);
router.post('/independent-check', validate(independentCheckSchema), ctrl.independentCheckCtrl);

router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.post('/', validate(startSchema), ctrl.startCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.get('/:id/wrong-answers', validate(idParamsSchema, 'params'), ctrl.getWrongAnswersCtrl);
router.get('/:id/score-history', validate(idParamsSchema, 'params'), ctrl.getScoreHistoryCtrl);
router.patch('/:id/flag', validate(idParamsSchema, 'params'), validate(flagSchema), ctrl.setFlagCtrl);
router.patch('/:id/draft', validate(idParamsSchema, 'params'), validate(draftSchema), ctrl.saveDraftCtrl);
router.patch('/:id/submit', validate(idParamsSchema, 'params'), validate(submitSchema), ctrl.submitCtrl);

module.exports = router;
