import mongoose from 'mongoose';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { User } from '../users/user.model.js';
import { Session } from '../../models/session.model.js';
import { EmailOutbox } from '../../models/emailOutbox.model.js';
import { tokenService } from '../../services/token.service.js';
import { otpService } from '../../services/otp.service.js';
import { enqueueEmailJob } from '../../queues/email.queue.js';
import { ApiError } from '../../utils/ApiError.js';
import { config } from '../../config/index.js';
import { logger } from '../../config/logger.js';
import { parseDuration, OTP_PURPOSES } from './auth.constants.js';

const REFRESH_TOKEN_EXPIRY_MS = parseDuration(config.JWT_REFRESH_EXPIRES);

class AuthService {
  // ─── Registration ───────────────────────────────────────────

  /**
   * Register a new user.
   * Account is created with isEmailVerified = false.
   * Automatically queues an OTP verification email.
   *
   * @param {{ name: string, email: string, password: string }} data
   * @returns {Promise<object>} sanitized user object
   */
  async register({ name, email, password }) {
    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw ApiError.conflict('An account with this email already exists');
    }

    const user = await User.create({
      name,
      email: normalizedEmail,
      password,
      isEmailVerified: false,
    });

    logger.info(`New user registered: ${user.email} (${user._id})`);

    // Automatically send verification OTP
    try {
      await this.sendOtp({
        email: normalizedEmail,
        purpose: OTP_PURPOSES.REGISTRATION,
        recipientName: user.name,
      });
    } catch (err) {
      logger.warn(`Failed to auto-send registration OTP to ${normalizedEmail}: ${err.message}`);
    }

    return user.toJSON();
  }

  // ─── Login ──────────────────────────────────────────────────

  /**
   * Authenticate a user and create a session with token pair.
   *
   * @param {{ email: string, password: string, userAgent: string, ipAddress: string }} data
   * @returns {Promise<{ user: object, accessToken: string, refreshToken: string }>}
   */
  async login({ email, password, userAgent, ipAddress }) {
    const normalizedEmail = email.toLowerCase().trim();

    // Retrieve user WITH password field
    const user = await User.findOne({ email: normalizedEmail }).select('+password');
    if (!user) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    // Email verification gate
    if (!user.isEmailVerified) {
      // Auto-trigger OTP send if not in cooldown
      try {
        await this.sendOtp({
          email: normalizedEmail,
          purpose: OTP_PURPOSES.REGISTRATION,
          recipientName: user.name,
        });
      } catch {
        // Cooldown active, ignore
      }
      throw ApiError.forbidden(
        'Please verify your email address before logging in. A verification code has been sent to your email.'
      );
    }

    // Create session + tokens
    const { accessToken, refreshToken } = await this._createSession(user, {
      userAgent,
      ipAddress,
    });

    // Track last login
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    return {
      user: user.toJSON(),
      accessToken,
      refreshToken,
    };
  }

  // ─── OTP System ─────────────────────────────────────────────

  /**
   * Generate an OTP and reliably dispatch an email via Outbox + BullMQ.
   * Prevents revealing whether an email exists for password recovery.
   *
   * @param {{ email: string, purpose: string, recipientName?: string }} params
   */
  async sendOtp({ email, purpose, recipientName = '' }) {
    const normalizedEmail = email.toLowerCase().trim();

    // Check user existence if forgot password
    const user = await User.findOne({ email: normalizedEmail });
    if (purpose === OTP_PURPOSES.FORGOT_PASSWORD && !user) {
      // Generic success to prevent email enumeration
      logger.info(`Forgot password OTP requested for non-existent email: ${normalizedEmail}`);
      return { message: 'If this email is registered, a verification code has been sent.' };
    }

    const name = recipientName || user?.name || '';

    // 1. Generate & store HMAC hash in Redis
    const { otp, expiresIn } = await otpService.generateAndSaveOtp(normalizedEmail, purpose);

    // 2. Transactional Outbox record
    const eventId = uuidv4();
    const eventType =
      purpose === OTP_PURPOSES.FORGOT_PASSWORD ? 'PASSWORD_RESET' : 'OTP_VERIFICATION';

    const outboxEvent = await EmailOutbox.create({
      eventId,
      eventType,
      recipientEmail: normalizedEmail,
      recipientName: name,
      subject:
        purpose === OTP_PURPOSES.FORGOT_PASSWORD
          ? 'WorkFlowX - Password Reset Verification Code'
          : `WorkFlowX - Verification Code: ${otp}`,
      payload: {
        otp,
        purpose,
        expiresIn,
      },
      status: 'QUEUED',
    });

    // 3. Dispatch to BullMQ
    try {
      await enqueueEmailJob(outboxEvent);
    } catch (err) {
      logger.error(`Failed to enqueue email job for ${normalizedEmail}: ${err.message}`);
      // Outbox status remains QUEUED/PENDING for worker recovery sweep
    }

    return {
      message: 'Verification code sent successfully.',
      expiresInSeconds: expiresIn,
    };
  }

  /**
   * Verify candidate OTP.
   *
   * @param {{ email: string, otp: string, purpose: string }} params
   * @returns {Promise<{ verified: boolean, resetToken?: string }>}
   */
  async verifyOtp({ email, otp, purpose }) {
    const normalizedEmail = email.toLowerCase().trim();

    // 1. Verify against Redis
    await otpService.verifyOtp(normalizedEmail, otp, purpose);

    // 2. Purpose-specific post-verification handling
    if (purpose === OTP_PURPOSES.REGISTRATION) {
      const user = await User.findOneAndUpdate(
        { email: normalizedEmail },
        { isEmailVerified: true },
        { new: true }
      );
      if (!user) {
        throw ApiError.notFound('Account not found for this email.');
      }
      return {
        verified: true,
        message: 'Email verified successfully. You can now log in.',
      };
    }

    if (purpose === OTP_PURPOSES.FORGOT_PASSWORD) {
      // Issue short-lived password reset authorization token
      const resetToken = await otpService.createPasswordResetToken(normalizedEmail);
      return {
        verified: true,
        resetToken,
        message: 'OTP verified. Use reset token to change password.',
      };
    }

    return {
      verified: true,
      message: 'OTP verified successfully.',
    };
  }

  /**
   * Resend OTP.
   */
  async resendOtp({ email, purpose }) {
    return this.sendOtp({ email, purpose });
  }

  // ─── Forgot & Reset Password ────────────────────────────────

  /**
   * Request password reset OTP.
   */
  async forgotPassword(email) {
    return this.sendOtp({
      email,
      purpose: OTP_PURPOSES.FORGOT_PASSWORD,
    });
  }

  /**
   * Reset password using authorization token issued upon successful OTP verification.
   *
   * @param {{ resetToken: string, newPassword: string }} params
   */
  async resetPassword({ resetToken, newPassword }) {
    // 1. Consume token from Redis (atomic one-time use)
    const email = await otpService.consumePasswordResetToken(resetToken);

    // 2. Find user
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      throw ApiError.notFound('User not found.');
    }

    // 3. Update password
    user.password = newPassword;
    await user.save();

    // 4. Invalidate all sessions for security
    await Session.updateMany({ userId: user._id, isRevoked: false }, { isRevoked: true });

    logger.info(`Password reset successfully for user: ${email} (${user._id})`);

    return {
      message: 'Password has been reset successfully. Please log in with your new password.',
    };
  }

  // ─── Refresh Token Rotation ─────────────────────────────────

  /**
   * Rotate refresh tokens.
   */
  async refreshTokens({ refreshToken, userAgent, ipAddress }) {
    let decoded;
    try {
      decoded = tokenService.verifyRefreshToken(refreshToken);
    } catch {
      throw ApiError.unauthorized('Invalid or expired refresh token');
    }

    const tokenHash = this._hashToken(refreshToken);

    const session = await Session.findOne({
      _id: decoded.sessionId,
      userId: decoded.userId,
    });

    if (!session) {
      throw ApiError.unauthorized('Session not found');
    }

    // Reuse detection
    if (session.isRevoked) {
      logger.warn(
        `Refresh-token reuse detected for user ${decoded.userId}, session ${session._id}. Revoking ALL sessions.`
      );
      await Session.updateMany({ userId: decoded.userId }, { isRevoked: true });
      throw ApiError.unauthorized(
        'Refresh token reuse detected. All sessions have been revoked for security.'
      );
    }

    if (session.refreshTokenHash !== tokenHash) {
      logger.warn(
        `Refresh-token hash mismatch for user ${decoded.userId}, session ${session._id}. Revoking ALL sessions.`
      );
      await Session.updateMany({ userId: decoded.userId }, { isRevoked: true });
      throw ApiError.unauthorized(
        'Refresh token reuse detected. All sessions have been revoked for security.'
      );
    }

    // Revoke old session
    session.isRevoked = true;
    await session.save();

    // Issue new session
    const user = await User.findById(decoded.userId);
    if (!user) {
      throw ApiError.unauthorized('User no longer exists');
    }

    const result = await this._createSession(user, { userAgent, ipAddress });

    return {
      user: user.toJSON(),
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    };
  }

  // ─── Logout ─────────────────────────────────────────────────

  async logout(sessionId, userId) {
    const session = await Session.findOneAndUpdate(
      { _id: sessionId, userId, isRevoked: false },
      { isRevoked: true },
      { new: true }
    );

    if (session) {
      logger.info(`User ${userId} logged out from session ${sessionId}`);
    }
  }

  async logoutAll(userId) {
    const result = await Session.updateMany(
      { userId, isRevoked: false },
      { isRevoked: true }
    );

    logger.info(
      `User ${userId} logged out from all devices (${result.modifiedCount} sessions revoked)`
    );

    return { sessionsRevoked: result.modifiedCount };
  }

  // ─── Current User ──────────────────────────────────────────

  async getCurrentUser(userId) {
    const user = await User.findById(userId);
    if (!user) {
      throw ApiError.notFound('User not found');
    }
    return user.toJSON();
  }

  // ─── Change Password ──────────────────────────────────────

  async changePassword(userId, oldPassword, newPassword) {
    const user = await User.findById(userId).select('+password');
    if (!user) {
      throw ApiError.notFound('User not found');
    }

    const isMatch = await user.comparePassword(oldPassword);
    if (!isMatch) {
      throw ApiError.unauthorized('Current password is incorrect');
    }

    user.password = newPassword;
    await user.save();

    await Session.updateMany({ userId: user._id, isRevoked: false }, { isRevoked: true });

    logger.info(`Password changed for user ${user.email} (${user._id})`);
  }

  // ─── Session Management ────────────────────────────────────

  async getUserSessions(userId) {
    return Session.find({
      userId,
      isRevoked: false,
      expiresAt: { $gt: new Date() },
    })
      .select('userAgent ipAddress deviceInfo createdAt expiresAt')
      .sort({ createdAt: -1 })
      .lean();
  }

  // ─── Private Helpers ───────────────────────────────────────

  async _createSession(user, { userAgent = '', ipAddress = '' }) {
    const sessionId = new mongoose.Types.ObjectId();

    const accessToken = tokenService.generateAccessToken({
      userId: user._id.toString(),
      email: user.email,
    });

    const refreshToken = tokenService.generateRefreshToken({
      userId: user._id.toString(),
      sessionId: sessionId.toString(),
    });

    const refreshTokenHash = this._hashToken(refreshToken);

    await Session.create({
      _id: sessionId,
      userId: user._id,
      refreshTokenHash,
      userAgent,
      ipAddress,
      deviceInfo: this._parseDeviceInfo(userAgent),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS),
    });

    return { accessToken, refreshToken, sessionId };
  }

  _hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  _parseDeviceInfo(userAgent) {
    if (!userAgent) return 'Unknown device';
    const ua = userAgent.toLowerCase();
    if (ua.includes('postman')) return 'Postman';
    if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone'))
      return 'Mobile';
    if (ua.includes('tablet') || ua.includes('ipad')) return 'Tablet';
    return 'Desktop';
  }
}

export const authService = new AuthService();
