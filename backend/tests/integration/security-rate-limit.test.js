import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import {
  setupTestEnvironment,
  clearTestEnvironment,
  teardownTestEnvironment,
} from '../helpers/testDb.js';
import { createVerifiedUserAndLogin } from '../helpers/authHelper.js';

describe('Security Hardening, SSL Headers, Schema Stoppers & Rate Limiters', () => {
  beforeAll(async () => {
    await setupTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment();
  });

  it('should enforce strict Helmet SSL/HSTS/CSP headers and hide X-Powered-By', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
  });

  it('should rate-limit failed login attempts (429 after 5 failed attempts)', async () => {
    const { user } = await createVerifiedUserAndLogin({
      email: 'bruteforce@acme.com',
      password: 'CorrectPassword123!',
    });

    for (let i = 0; i < 5; i++) {
      const failRes = await request(app)
        .post('/api/v1/auth/login')
        .set('x-test-rate-limit', 'true')
        .send({ email: user.email, password: 'WrongPassword!' });
      expect(failRes.status).toBe(401);
    }

    // 6th attempt must be blocked by loginLimiter
    const blockedRes = await request(app)
      .post('/api/v1/auth/login')
      .set('x-test-rate-limit', 'true')
      .send({ email: user.email, password: 'WrongPassword!' });

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.success).toBe(false);
    expect(blockedRes.body.message).toMatch(/rate-limited/i);
  });

  it('should rate-limit OTP send requests (429 after 5 requests)', async () => {
    const email = 'otplimit@acme.com';

    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/v1/auth/send-otp')
        .set('x-test-rate-limit', 'true')
        .send({ email, purpose: 'REGISTRATION' });
    }

    const blockedRes = await request(app)
      .post('/api/v1/auth/send-otp')
      .set('x-test-rate-limit', 'true')
      .send({ email, purpose: 'REGISTRATION' });

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.message).toMatch(/Too many OTP requests/i);
  });

  it('should rate-limit OTP verify attempts (429 after 10 attempts)', async () => {
    const email = 'otpverify@acme.com';

    for (let i = 0; i < 10; i++) {
      await request(app)
        .post('/api/v1/auth/verify-otp')
        .set('x-test-rate-limit', 'true')
        .send({ email, otp: '123456', purpose: 'REGISTRATION' });
    }

    const blockedRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .set('x-test-rate-limit', 'true')
      .send({ email, otp: '123456', purpose: 'REGISTRATION' });

    expect(blockedRes.status).toBe(429);
    expect(blockedRes.body.message).toMatch(/Too many OTP verification attempts/i);
  });

  it('should reject malformed JSON payloads with 400 and strip NoSQL operators', async () => {
    const badJsonRes = await request(app)
      .post('/api/v1/auth/login')
      .set('Content-Type', 'application/json')
      .send('{"email": "bad-json"');

    expect(badJsonRes.status).toBe(400);
    expect(badJsonRes.body.message).toBe('Invalid JSON payload');

    // NoSQL operator injection attempt in body
    const nosqlRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: { $ne: '' }, password: { $gt: '' } });

    expect(nosqlRes.status).toBe(400);
    expect(nosqlRes.body.message).toBe('Validation failed');
  });
});

