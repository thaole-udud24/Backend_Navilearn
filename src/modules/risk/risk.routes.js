const express = require('express');
const authenticate = require('../../middlewares/authenticate');
const authorize = require('../../middlewares/authorize');
const validate = require('../../middlewares/validate');
const { ROLES } = require('../../shared/roles');
const { dismissSchema } = require('./risk.validation');
const ctrl = require('./risk.controller');

const router = express.Router();

// N9: personal learning data (BR-02/BR-35) — system-generated warnings for the logged-in student
// only; Admin configures the thresholds that drive them via the business-rule module instead (B14).
router.use(authenticate, authorize(ROLES.STUDENT));
router.get('/warnings', ctrl.listWarningsCtrl);
router.post('/warnings/dismiss', validate(dismissSchema), ctrl.dismissCtrl);

module.exports = router;
