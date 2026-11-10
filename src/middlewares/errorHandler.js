import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

/**
 * Global Express error-handling middleware.
 * Must be registered LAST with app.use(errorHandler).
 */
// eslint-disable-next-line no-unused-vars
export const errorHandler = (err, req, res, next) => {
  let error = err;

  // ── Wrap non-ApiError instances ──────────────────────────────
  if (!(error instanceof ApiError)) {
    let statusCode = error.statusCode || 500;
    let message = error.message || 'Internal server error';
    const errors = [];

    // Mongoose validation error
    if (err.name === 'ValidationError') {
      statusCode = 400;
      message = 'Validation failed';
      for (const field of Object.values(err.errors)) {
        errors.push(field.message);
      }
    }

    // Mongoose bad ObjectId cast
    if (err.name === 'CastError') {
      statusCode = 400;
      message = `Invalid ${err.path}: ${err.value}`;
    }

    // MongoDB duplicate key
    if (err.code === 11000) {
      statusCode = 409;
      const field = Object.keys(err.keyValue || {})[0] || 'field';
      message = `Duplicate value for field: ${field}`;
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
      statusCode = 401;
      message = 'Invalid token';
    }
    if (err.name === 'TokenExpiredError') {
      statusCode = 401;
      message = 'Token expired';
    }

    // Multer file upload errors
    if (err.name === 'MulterError') {
      statusCode = 400;
      message = err.code === 'LIMIT_FILE_SIZE'
        ? 'File size exceeds the 10MB limit'
        : `File upload error: ${err.message}`;
    }

    // Malformed JSON or oversized payload errors from express.json()
    if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
      statusCode = 400;
      message = 'Invalid JSON payload';
    }
    if (err.type === 'entity.too.large') {
      statusCode = 413;
      message = 'Request payload exceeds maximum allowed size';
    }

    error = new ApiError(statusCode, message, errors, err.stack);
  }

  // ── Log server-side errors ───────────────────────────────────
  if (error.statusCode >= 500) {
    logger.error(`${error.statusCode} - ${error.message}`, {
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
      stack: error.stack,
    });
  }

  // ── Build response ───────────────────────────────────────────
  const response = {
    success: false,
    message: error.message,
  };

  if (error.errors && error.errors.length > 0) {
    response.errors = error.errors;
  }

  // Include stack trace only in development
  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }

  res.status(error.statusCode).json(response);
};

