import { User } from '../modules/users/user.model.js';
import { tokenService } from '../services/token.service.js';
import { ApiError } from '../utils/ApiError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

/**
 * JWT authentication middleware.
 *
 * Extracts the Bearer token from the Authorization header,
 * verifies it, loads the user document, and attaches it to `req.user`.
 *
 * Usage:
 *   router.get('/protected', authenticate, handler);
 */
export const authenticate = asyncHandler(async (req, _res, next) => {
  // 1. Extract token
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Access token is required');
  }

  const token = authHeader.split(' ')[1];
  if (!token) {
    throw ApiError.unauthorized('Access token is required');
  }

  // 2. Verify token
  let decoded;
  try {
    decoded = tokenService.verifyAccessToken(token);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Access token has expired');
    }
    throw ApiError.unauthorized('Invalid access token');
  }

  // 3. Load user (without password)
  const user = await User.findById(decoded.userId);
  if (!user) {
    throw ApiError.unauthorized('User belonging to this token no longer exists');
  }

  // 4. Attach to request
  req.user = user;
  next();
});

