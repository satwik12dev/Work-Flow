import rateLimit from 'express-rate-limit';

/**
 * Skip rate limiters during automated tests unless explicitly enabled
 * via the `x-test-rate-limit: true` header for rate-limiter tests.
 */
const skipInTest = (req) =>
  process.env.NODE_ENV === 'test' && req.headers['x-test-rate-limit'] !== 'true';

/**
 * Composite key combining client IP and normalized email so attackers
 * cannot brute-force a single account across rotating IPs.
 */
const ipAndEmailKey = (req) => {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const email = typeof req.body?.email === 'string'
    ? req.body.email.toLowerCase().trim()
    : '';
  return email ? `${ip}:${email}` : ip;
};

/**
 * Default global rate limiter — 100 requests per 15 minutes per IP.
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    success: false,
    message: 'Too many requests, please try again later.',
  },
});

/**
 * General authentication endpoint limiter (register, refresh) — 20 per 15 minutes.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later.',
  },
});

/**
 * Dedicated Login Brute-Force Limiter — 5 failed login attempts per 15 minutes per IP + email.
 * Successful logins are not counted against the limit.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  keyGenerator: ipAndEmailKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    success: false,
    message: 'Too many failed login attempts. Account login is temporarily rate-limited for 15 minutes.',
  },
});

/**
 * Dedicated OTP Send / Resend Limiter — 5 requests per 15 minutes per IP + email.
 */
export const otpSendLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: ipAndEmailKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    success: false,
    message: 'Too many OTP requests. Please try again after 15 minutes.',
  },
});

/**
 * Dedicated OTP Verification Limiter — 10 attempts per 15 minutes per IP + email.
 */
export const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: ipAndEmailKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    success: false,
    message: 'Too many OTP verification attempts. Please try again later.',
  },
});

/**
 * Legacy alias preserved for compatibility.
 */
export const otpLimiter = otpSendLimiter;

/**
 * Very strict limiter — 5 per 15 minutes (forgot password, reset password, change password).
 */
export const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: ipAndEmailKey,
  standardHeaders: true,
  legacyHeaders: false,
  skip: skipInTest,
  message: {
    success: false,
    message: 'Rate limit exceeded. Please try again later.',
  },
});
