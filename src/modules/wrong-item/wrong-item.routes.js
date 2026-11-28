const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const { listQuerySchema, idParamsSchema, retryQuerySchema } = require('./wrong-item.validation');
const ctrl = require('./wrong-item.controller');

const router = express.Router();

// Personal learning data (BR-02/BR-35): student-only, no admin read.
router.use(authenticate, authorize(ROLES.STUDENT));

// Literal path before '/:id' so it isn't swallowed by the id param route.
router.get('/retry-question-ids', validate(retryQuerySchema, 'query'), ctrl.retryQuestionIdsCtrl);
router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.post('/:id/mastered', validate(idParamsSchema, 'params'), ctrl.markMasteredCtrl);

module.exports = router;
