const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const { generateQuestionSchema, listQuerySchema, idParamsSchema } = require('./ai-assist.validation');
const ctrl = require('./ai-assist.controller');

const router = express.Router();

router.use(authenticate, authorize(ROLES.ADMIN));
router.post('/generate-question', validate(generateQuestionSchema), ctrl.generateQuestionCtrl);
router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);

module.exports = router;
