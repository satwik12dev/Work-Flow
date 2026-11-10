import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';

/**
 * Centralized JWT token generation and verification.
 */
export const tokenService = {
  /**
   * Generate a short-lived access token.
   * Payload should contain at minimum { userId, email }.
   * @param {object} payload
   * @returns {string}
   */
  generateAccessToken(payload) {
    return jwt.sign(payload, config.JWT_ACCESS_SECRET, {
      expiresIn: config.JWT_ACCESS_EXPIRES,
    });
  },

  /**
   * Generate a longer-lived refresh token.
   * Payload should contain { userId, sessionId }.
   * @param {object} payload
   * @returns {string}
   */
  generateRefreshToken(payload) {
    return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
      expiresIn: config.JWT_REFRESH_EXPIRES,
    });
  },

  /**
   * Verify and decode an access token.
   * @param {string} token
   * @returns {object} decoded payload
   * @throws {JsonWebTokenError|TokenExpiredError}
   */
  verifyAccessToken(token) {
    return jwt.verify(token, config.JWT_ACCESS_SECRET);
  },

  /**
   * Verify and decode a refresh token.
   * @param {string} token
   * @returns {object} decoded payload
   * @throws {JsonWebTokenError|TokenExpiredError}
   */
  verifyRefreshToken(token) {
    return jwt.verify(token, config.JWT_REFRESH_SECRET);
  },
};

