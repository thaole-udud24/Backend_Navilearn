const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const { startSchema, submitSchema, listQuerySchema, idParamsSchema } = require('./assessment.validation');
const ctrl = require('./assessment.controller');

const router = express.Router();

// Personal learning data (BR-02/BR-35): student-only, no admin read.
router.use(authenticate, authorize(ROLES.STUDENT));
router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.post('/', validate(startSchema), ctrl.startCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);
router.patch('/:id/submit', validate(idParamsSchema, 'params'), validate(submitSchema), ctrl.submitCtrl);

module.exports = router;
