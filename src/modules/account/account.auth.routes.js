const express = require('express');
const validate = require('../../middlewares/validate');
const authenticate = require('../../middlewares/authenticate');
const { authLimiter } = require('../../middlewares/rateLimiter');
const { registerSchema, loginSchema, refreshSchema } = require('./account.auth.validation');
const { registerCtrl, loginCtrl, refreshCtrl, meCtrl } = require('./account.auth.controller');

const router = express.Router();

router.post('/register', authLimiter, validate(registerSchema), registerCtrl);
router.post('/login', authLimiter, validate(loginSchema), loginCtrl);
router.post('/refresh', authLimiter, validate(refreshSchema), refreshCtrl);
router.get('/me', authenticate, meCtrl);

module.exports = router;
