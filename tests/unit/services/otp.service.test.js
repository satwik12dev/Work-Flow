import { describe, it, expect, beforeEach } from '@jest/globals';
import { otpService } from '../../../src/services/otp.service.js';
import { setRedisClient } from '../../../src/config/redis.js';
import { MockRedis } from '../../helpers/mockRedis.js';
import { OTP_PURPOSES } from '../../../src/modules/auth/auth.constants.js';

describe('OTP Service Unit Tests', () => {
  let mockRedis;

  beforeEach(() => {
    mockRedis = new MockRedis();
    setRedisClient(mockRedis);
  });

  it('should generate a 6-digit OTP and store only an HMAC hash in Redis', async () => {
    const email = 'test@example.com';
    const { otp, expiresIn } = await otpService.generateAndSaveOtp(
      email,
      OTP_PURPOSES.REGISTRATION
    );

    expect(otp).toMatch(/^\d{6}$/);
    expect(expiresIn).toBe(300);

    const storedRaw = await mockRedis.get(`otp:REGISTRATION:${email}`);
    expect(storedRaw).not.toBeNull();
    const parsed = JSON.parse(storedRaw);
    expect(parsed.hash).toBeDefined();
    expect(parsed.hash).not.toBe(otp); // Never plaintext
    expect(storedRaw).not.toContain(otp);
    expect(parsed.attempts).toBe(0);
  });

  it('should enforce 60-second resend cooldown', async () => {
    const email = 'cooldown@example.com';
    await otpService.generateAndSaveOtp(email, OTP_PURPOSES.REGISTRATION);

    await expect(
      otpService.generateAndSaveOtp(email, OTP_PURPOSES.REGISTRATION)
    ).rejects.toThrow(/Please wait/);

    // Advance past 60s cooldown
    mockRedis.advanceTime(61);
    const second = await otpService.generateAndSaveOtp(email, OTP_PURPOSES.REGISTRATION);
    expect(second.otp).toMatch(/^\d{6}$/);
  });

  it('should verify valid OTP and delete it to prevent reuse', async () => {
    const email = 'verify@example.com';
    const { otp } = await otpService.generateAndSaveOtp(email, OTP_PURPOSES.REGISTRATION);

    const result = await otpService.verifyOtp(email, otp, OTP_PURPOSES.REGISTRATION);
    expect(result).toBe(true);

    // Key deleted
    const stored = await mockRedis.get(`otp:REGISTRATION:${email}`);
    expect(stored).toBeNull();

    // Reuse attempt fails
    await expect(
      otpService.verifyOtp(email, otp, OTP_PURPOSES.REGISTRATION)
    ).rejects.toThrow(/expired or not found/i);
  });

  it('should reject expired OTP after 5 minutes TTL', async () => {
    const email = 'expire@example.com';
    const { otp } = await otpService.generateAndSaveOtp(email, OTP_PURPOSES.FORGOT_PASSWORD);

    mockRedis.advanceTime(301);

    await expect(
      otpService.verifyOtp(email, otp, OTP_PURPOSES.FORGOT_PASSWORD)
    ).rejects.toThrow(/expired or not found/i);
  });

  it('should lock out and delete OTP after 5 incorrect attempts', async () => {
    const email = 'attempts@example.com';
    const { otp } = await otpService.generateAndSaveOtp(email, OTP_PURPOSES.REGISTRATION);
    const wrongOtp = otp === '000000' ? '111111' : '000000';

    for (let i = 1; i <= 4; i++) {
      await expect(
        otpService.verifyOtp(email, wrongOtp, OTP_PURPOSES.REGISTRATION)
      ).rejects.toThrow(/attempt\(s\) remaining/);
    }

    // 5th attempt deletes key and throws max attempts exceeded
    await expect(
      otpService.verifyOtp(email, wrongOtp, OTP_PURPOSES.REGISTRATION)
    ).rejects.toThrow(/Maximum verification attempts exceeded/);

    // Even valid OTP fails now because key was deleted
    await expect(
      otpService.verifyOtp(email, otp, OTP_PURPOSES.REGISTRATION)
    ).rejects.toThrow(/expired or not found/i);
  });

  it('should issue and consume a single-use password reset token', async () => {
    const email = 'reset@example.com';
    const resetToken = await otpService.createPasswordResetToken(email);
    expect(typeof resetToken).toBe('string');
    expect(resetToken.length).toBeGreaterThan(20);

    const resolvedEmail = await otpService.consumePasswordResetToken(resetToken);
    expect(resolvedEmail).toBe(email);

    // Second use fails
    await expect(otpService.consumePasswordResetToken(resetToken)).rejects.toThrow(
      /invalid or has expired/i
    );
  });
});

