const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const {
  createSchema,
  sessionSchema,
  updateSessionSchema,
  goalSchema,
  updateGoalSchema,
  listQuerySchema,
  idParamsSchema,
  sessionParamsSchema,
} = require('./planning.validation');
const ctrl = require('./planning.controller');

const router = express.Router();

// Personal learning data (BR-02/BR-35): student-only, admin has no access.
router.use(authenticate, authorize(ROLES.STUDENT));
// Goals (PLN-03): declared before '/:id' so '/goals' is not read as a plan id.
router.post('/goals', validate(goalSchema), ctrl.createGoalCtrl);
router.get('/goals', validate(listQuerySchema, 'query'), ctrl.listGoalsCtrl);
router.get('/goals/:id', validate(idParamsSchema, 'params'), ctrl.getGoalCtrl);
router.patch('/goals/:id', validate(idParamsSchema, 'params'), validate(updateGoalSchema), ctrl.updateGoalCtrl);
router.delete('/goals/:id', validate(idParamsSchema, 'params'), ctrl.removeGoalCtrl);


router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.post('/', validate(createSchema), ctrl.createCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.patch('/:id/confirm', validate(idParamsSchema, 'params'), ctrl.confirmCtrl);
router.post('/:id/sessions', validate(idParamsSchema, 'params'), validate(sessionSchema), ctrl.addSessionCtrl);
router.patch('/:id/sessions/:sessionId', validate(sessionParamsSchema, 'params'), validate(updateSessionSchema), ctrl.updateSessionCtrl);
router.delete('/:id/sessions/:sessionId', validate(sessionParamsSchema, 'params'), ctrl.removeSessionCtrl);

router.delete('/:id', validate(idParamsSchema, 'params'), ctrl.removeCtrl);

module.exports = router;
