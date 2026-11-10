import { ApiError } from '../utils/ApiError.js';

/**
 * Express middleware factory that validates `req.body`, `req.query` and
 * `req.params` against a Zod schema.
 *
 * The schema should be shaped like:
 *   z.object({
 *     body:   z.object({ ... }).optional(),
 *     query:  z.object({ ... }).optional(),
 *     params: z.object({ ... }).optional(),
 *   })
 *
 * After successful validation the parsed (and transformed) values replace
 * the originals on `req`.
 *
 * @param {import('zod').ZodSchema} schema
 * @returns {import('express').RequestHandler}
 */
export const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse({
    body: req.body,
    query: req.query,
    params: req.params,
  });

  if (!result.success) {
    const errors = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ApiError(400, 'Validation failed', errors);
  }

  // Replace req data with parsed + transformed values (Express 5 safe)
  if (result.data.body) req.body = result.data.body;
  if (result.data.query) {
    Object.defineProperty(req, 'query', {
      value: result.data.query,
      writable: true,
      enumerable: true,
      configurable: true,
    });
  }
  if (result.data.params) req.params = result.data.params;

  next();
};

