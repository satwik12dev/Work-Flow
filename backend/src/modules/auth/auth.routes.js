import { Router } from 'express';
import { authController } from './auth.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { validate } from '../../middlewares/validate.js';
import {
  authLimiter,
  loginLimiter,
  otpSendLimiter,
  otpVerifyLimiter,
  strictLimiter,
} from '../../middlewares/rateLimiter.js';
import {
  registerSchema,
  loginSchema,
  changePasswordSchema,
  sendOtpSchema,
  verifyOtpSchema,
  resendOtpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.validators.js';

const router = Router();

// ─── Public Endpoints ─────────────────────────────────────────

router.post(
  '/register',
  authLimiter,
  validate(registerSchema),
  authController.register
);

router.post(
  '/login',
  loginLimiter,
  validate(loginSchema),
  authController.login
);

router.post(
  '/refresh',
  authLimiter,
  authController.refreshTokens
);

router.post(
  '/logout',
  authController.logout
);

// ─── OTP & Password Recovery Endpoints ────────────────────────

router.post(
  '/send-otp',
  otpSendLimiter,
  validate(sendOtpSchema),
  authController.sendOtp
);

router.post(
  '/verify-otp',
  otpVerifyLimiter,
  validate(verifyOtpSchema),
  authController.verifyOtp
);

router.post(
  '/resend-otp',
  otpSendLimiter,
  validate(resendOtpSchema),
  authController.resendOtp
);

router.post(
  '/forgot-password',
  strictLimiter,
  validate(forgotPasswordSchema),
  authController.forgotPassword
);

router.post(
  '/reset-password',
  strictLimiter,
  validate(resetPasswordSchema),
  authController.resetPassword
);

// ─── Protected Endpoints ──────────────────────────────────────

router.use(authenticate);

router.get('/me', authController.getMe);
router.post('/logout-all', authController.logoutAll);
router.post(
  '/change-password',
  strictLimiter,
  validate(changePasswordSchema),
  authController.changePassword
);
router.get('/sessions', authController.getSessions);

export default router;
