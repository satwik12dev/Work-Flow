/**
 * Recursively strips MongoDB query operators (keys starting with `$` or containing `.`)
 * and prototype-pollution keys (`__proto__`, `constructor`, `prototype`) in-place.
 * Compatible with Express 5 read-only `req.query` getters.
 */
const sanitizeObjectInPlace = (obj) => {
  if (!obj || typeof obj !== 'object') return;

  if (Array.isArray(obj)) {
    for (const item of obj) {
      sanitizeObjectInPlace(item);
    }
    return;
  }

  for (const key of Object.keys(obj)) {
    if (
      key.startsWith('$') ||
      key.includes('.') ||
      key === '__proto__' ||
      key === 'constructor' ||
      key === 'prototype'
    ) {
      delete obj[key];
      continue;
    }

    if (typeof obj[key] === 'object' && obj[key] !== null) {
      sanitizeObjectInPlace(obj[key]);
    }
  }
};

/**
 * Middleware to prevent NoSQL operator injection across body, query, and params.
 */
export const sanitizeInput = (req, _res, next) => {
  if (req.body) sanitizeObjectInPlace(req.body);
  if (req.query) sanitizeObjectInPlace(req.query);
  if (req.params) sanitizeObjectInPlace(req.params);
  next();
};

