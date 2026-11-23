const express = require('express');
const validate = require('../../middlewares/validate');
const authenticate = require('../../middlewares/authenticate');
const { authLimiter } = require('../../middlewares/rateLimiter');
const schemas = require('./account.auth.validation');
const ctrl = require('./account.auth.controller');

const router = express.Router();

router.post('/register', authLimiter, validate(schemas.registerSchema), ctrl.registerCtrl);
router.post('/verify-email', authLimiter, validate(schemas.verifyEmailSchema), ctrl.verifyEmailCtrl);
router.post('/resend-otp', authLimiter, validate(schemas.resendOtpSchema), ctrl.resendOtpCtrl);
router.post('/login', authLimiter, validate(schemas.loginSchema), ctrl.loginCtrl);
router.post('/refresh', authLimiter, validate(schemas.refreshSchema), ctrl.refreshCtrl);
router.post('/logout', validate(schemas.refreshSchema), ctrl.logoutCtrl);
router.post('/forgot-password', authLimiter, validate(schemas.forgotPasswordSchema), ctrl.forgotPasswordCtrl);
router.post(
  '/verify-reset-otp',
  authLimiter,
  validate(schemas.verifyResetOtpSchema),
  ctrl.verifyResetOtpCtrl,
);
router.post('/reset-password', authLimiter, validate(schemas.resetPasswordSchema), ctrl.resetPasswordCtrl);
router.get('/me', authenticate, ctrl.meCtrl);

module.exports = router;
