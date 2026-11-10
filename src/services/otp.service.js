import crypto from 'crypto';
import { getRedisClient } from '../config/redis.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';
import { generateSecureOTP, hmacHash, generateToken } from '../utils/helpers.js';

class OtpService {
  /**
   * Get Redis key namespace for OTP storage.
   */
  _getOtpKey(purpose, email) {
    return `otp:${purpose}:${email.toLowerCase().trim()}`;
  }

  /**
   * Get Redis key namespace for cooldown.
   */
  _getCooldownKey(purpose, email) {
    return `otp:cooldown:${purpose}:${email.toLowerCase().trim()}`;
  }

  /**
   * Generate an OTP, save HMAC hash in Redis, set cooldown, and return plaintext OTP for sending.
   *
   * @param {string} email
   * @param {string} purpose - REGISTRATION | FORGOT_PASSWORD | EMAIL_CHANGE
   * @returns {Promise<{ otp: string, expiresIn: number }>}
   */
  async generateAndSaveOtp(email, purpose) {
    const redis = getRedisClient();
    const cooldownKey = this._getCooldownKey(purpose, email);

    // 1. Check cooldown
    const inCooldown = await redis.get(cooldownKey);
    if (inCooldown) {
      const ttl = await redis.ttl(cooldownKey);
      throw ApiError.badRequest(
        `Please wait ${ttl > 0 ? ttl : config.OTP_RESEND_COOLDOWN} seconds before requesting a new OTP.`
      );
    }

    // 2. Generate secure 6-digit OTP
    const otp = generateSecureOTP();

    // 3. HMAC hash of OTP
    const hash = hmacHash(otp, config.OTP_SECRET);

    // 4. Save hash and initialize attempts in Redis with TTL
    const otpKey = this._getOtpKey(purpose, email);
    const data = JSON.stringify({
      hash,
      attempts: 0,
      createdAt: Date.now(),
    });

    await redis.set(otpKey, data, 'EX', config.OTP_EXPIRY_SECONDS);

    // 5. Set cooldown key with TTL
    await redis.set(cooldownKey, '1', 'EX', config.OTP_RESEND_COOLDOWN);

    logger.debug(`Generated OTP for ${email} [${purpose}] (expires in ${config.OTP_EXPIRY_SECONDS}s)`);

    return {
      otp,
      expiresIn: config.OTP_EXPIRY_SECONDS,
    };
  }

  /**
   * Verify candidate OTP against the stored HMAC hash in Redis.
   *
   * @param {string} email
   * @param {string} otp
   * @param {string} purpose
   * @returns {Promise<boolean>}
   */
  async verifyOtp(email, otp, purpose) {
    const redis = getRedisClient();
    const otpKey = this._getOtpKey(purpose, email);

    const rawData = await redis.get(otpKey);
    if (!rawData) {
      throw ApiError.badRequest('OTP expired or not found. Please request a new one.');
    }

    let parsed;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      await redis.del(otpKey);
      throw ApiError.badRequest('Invalid OTP session state.');
    }

    // 1. Check attempts limit
    if (parsed.attempts >= config.OTP_MAX_ATTEMPTS) {
      await redis.del(otpKey);
      throw ApiError.badRequest(
        'Maximum OTP verification attempts exceeded. Please request a new code.'
      );
    }

    // 2. Hash user-submitted OTP
    const submittedHash = hmacHash(otp, config.OTP_SECRET);

    // Constant-time comparison
    const isMatch = crypto.timingSafeEqual(
      Buffer.from(parsed.hash, 'hex'),
      Buffer.from(submittedHash, 'hex')
    );

    if (!isMatch) {
      // Increment attempt counter
      parsed.attempts += 1;
      const ttl = await redis.ttl(otpKey);
      if (parsed.attempts >= config.OTP_MAX_ATTEMPTS) {
        await redis.del(otpKey);
        throw ApiError.badRequest(
          'Maximum verification attempts exceeded. Please request a new code.'
        );
      } else {
        if (ttl > 0) {
          await redis.set(otpKey, JSON.stringify(parsed), 'EX', ttl);
        }
        const remaining = config.OTP_MAX_ATTEMPTS - parsed.attempts;
        throw ApiError.badRequest(`Invalid verification code. ${remaining} attempt(s) remaining.`);
      }
    }

    // 3. Successful verification: Delete OTP to prevent reuse
    await redis.del(otpKey);
    logger.info(`OTP successfully verified for ${email} [${purpose}]`);
    return true;
  }

  /**
   * Issue a short-lived reset authorization token after FORGOT_PASSWORD OTP is verified.
   * Stored in Redis with 15-minute TTL.
   *
   * @param {string} email
   * @returns {Promise<string>} resetToken
   */
  async createPasswordResetToken(email) {
    const redis = getRedisClient();
    const resetToken = generateToken(32);
    const key = `reset_token:${resetToken}`;

    // Valid for 15 minutes
    await redis.set(key, email.toLowerCase().trim(), 'EX', 900);
    return resetToken;
  }

  /**
   * Verify and consume (delete) a password reset token.
   *
   * @param {string} resetToken
   * @returns {Promise<string>} email
   */
  async consumePasswordResetToken(resetToken) {
    const redis = getRedisClient();
    const key = `reset_token:${resetToken}`;
    const email = await redis.get(key);

    if (!email) {
      throw ApiError.badRequest('Password reset token is invalid or has expired.');
    }

    // Consume immediately to prevent token reuse
    await redis.del(key);
    return email;
  }
}

export const otpService = new OtpService();

