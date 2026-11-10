import { config } from '../config/index.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Enforce HTTPS / SSL in production environments.
 * Checks `req.secure` or `X-Forwarded-Proto === 'https'` (for Nginx / ALB / Cloudflare).
 * Exempts `/health` so internal Docker / load-balancer healthchecks remain reachable.
 */
export const enforceHTTPS = (req, res, next) => {
  if (
    config.NODE_ENV !== 'production' ||
    config.DISABLE_HTTPS_REDIRECT ||
    req.path === '/health'
  ) {
    return next();
  }

  const forwardedProto = req.headers['x-forwarded-proto'];
  const isHttps = req.secure || forwardedProto === 'https';

  if (!isHttps) {
    if (req.method === 'GET' || req.method === 'HEAD') {
      return res.redirect(301, `https://${req.headers.host}${req.originalUrl}`);
    }
    throw ApiError.forbidden('HTTPS/SSL is required in production.');
  }

  next();
};

/**
 * HTTP Parameter Pollution (HPP) protection.
 * Collapses duplicate scalar query parameters (`?status=TODO&status=DONE`) to the
 * last provided string so downstream string/Zod checks cannot be bypassed via arrays.
 */
export const hppProtection = (req, _res, next) => {
  if (req.query && typeof req.query === 'object') {
    for (const [key, value] of Object.entries(req.query)) {
      if (Array.isArray(value)) {
        req.query[key] = value[value.length - 1];
      }
    }
  }
  next();
};

