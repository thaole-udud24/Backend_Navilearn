const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const { ROLES } = require('../../shared/roles');
const validate = require('../../middlewares/validate');
const { replanSchema } = require('./adaptive.validation');
const ctrl = require('./adaptive.controller');

const router = express.Router();

// Personal learning data (BR-02/BR-35): student-only, admin has no access.
router.use(authenticate, authorize(ROLES.STUDENT));
router.get('/next-best-action', ctrl.nextBestActionCtrl);
router.post('/next-best-action/start', ctrl.startCtrl);
router.get('/replan-check/:planId', validate(replanSchema, 'params'), ctrl.checkReplanCtrl);
router.post('/replan', validate(replanSchema), ctrl.replanCtrl);

module.exports = router;