/**
 * Wraps an async Express route handler to forward rejected promises
 * to the global error handler via next().
 *
 * @param {Function} fn  Async (req, res, next) => Promise<void>
 * @returns {Function}   Express-compatible middleware
 */
export const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

