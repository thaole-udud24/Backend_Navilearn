const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const { listQuerySchema, idParamsSchema } = require('./mastery.validation');
const ctrl = require('./mastery.controller');

const router = express.Router();

// Personal learning data (BR-02/BR-35): student-only, no admin read, no write API — it is derived by grading.
router.use(authenticate, authorize(ROLES.STUDENT));
router.get('/', validate(listQuerySchema, 'query'), ctrl.listCtrl);
router.get('/:id', validate(idParamsSchema, 'params'), ctrl.getCtrl);

module.exports = router;
