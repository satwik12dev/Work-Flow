import { tokenService } from '../services/token.service.js';
import { User } from '../modules/users/user.model.js';
import { logger } from '../config/logger.js';

/**
 * Socket.IO authentication middleware.
 * Validates the JWT access token passed via `socket.handshake.auth.token`
 * or `Authorization: Bearer <token>` header.
 */
export const socketAuthenticate = async (socket, next) => {
  try {
    let token = socket.handshake.auth?.token;

    if (!token && socket.handshake.headers?.authorization) {
      const authHeader = socket.handshake.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        token = authHeader.split(' ')[1];
      }
    }

    if (!token) {
      return next(new Error('Authentication error: Access token required'));
    }

    const decoded = tokenService.verifyAccessToken(token);
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return next(new Error('Authentication error: User not found'));
    }

    socket.user = user;
    next();
  } catch (error) {
    logger.warn(`Socket authentication failed: ${error.message}`);
    next(new Error('Authentication error: Invalid or expired token'));
  }
};

