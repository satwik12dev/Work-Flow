import { config } from '../config/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * CSRF protection for cookie-based authentication routes (e.g., /auth/refresh, /auth/logout).
 *
 * Verifies that browser-originated state-changing requests carrying cookies originate from
 * the trusted `CLIENT_URL` origin. Non-browser API clients (Postman, curl, mobile, Supertest)
 * without an Origin/Referer header are permitted unless strict browser checks fail.
 */
export const csrfOriginCheck = (req, _res, next) => {
  const safeMethods = ['GET', 'HEAD', 'OPTIONS'];
  if (safeMethods.includes(req.method)) {
    return next();
  }

  // Only enforce when cookies are present on the request
  const hasCookies = req.cookies && Object.keys(req.cookies).length > 0;
  if (!hasCookies) {
    return next();
  }

  const origin = req.headers.origin;
  const referer = req.headers.referer;

  if (origin) {
    const allowedOrigin = new URL(config.CLIENT_URL).origin;
    if (origin !== allowedOrigin) {
      throw ApiError.forbidden('CSRF validation failed: Untrusted request origin.');
    }
    return next();
  }

  if (referer) {
    try {
      const refererOrigin = new URL(referer).origin;
      const allowedOrigin = new URL(config.CLIENT_URL).origin;
      if (refererOrigin !== allowedOrigin) {
        throw ApiError.forbidden('CSRF validation failed: Untrusted referer origin.');
      }
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.forbidden('CSRF validation failed: Invalid referer.');
    }
  }

  next();
};

