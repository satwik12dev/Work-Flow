import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import {
  setupTestEnvironment,
  clearTestEnvironment,
  teardownTestEnvironment,
} from '../helpers/testDb.js';
import { getTestEnqueuedJobs } from '../../src/queues/email.queue.js';
import { EmailOutbox } from '../../src/models/emailOutbox.model.js';
import { createVerifiedUserAndLogin } from '../helpers/authHelper.js';

describe('Auth Integration Tests', () => {
  beforeAll(async () => {
    await setupTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment();
  });

  it('should register a user, block login until OTP verified, verify OTP, and allow login', async () => {
    const email = 'alice@workflowx.io';
    const password = 'Password123!';

    // 1. Register
    const regRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Alice', email, password });

    expect(regRes.status).toBe(201);
    expect(regRes.body.success).toBe(true);
    expect(regRes.body.data.user.isEmailVerified).toBe(false);
    expect(regRes.body.data.user.password).toBeUndefined();

    // Verify OTP email job was created
    const jobs = getTestEnqueuedJobs();
    expect(jobs.length).toBe(1);
    expect(jobs[0].name).toBe('OTP_VERIFICATION');
    const otp = jobs[0].data.payload.otp;
    expect(otp).toMatch(/^\d{6}$/);

    // Check Outbox record exists
    const outbox = await EmailOutbox.findOne({ eventId: jobs[0].id });
    expect(outbox).not.toBeNull();
    expect(outbox.recipientEmail).toBe(email);

    // 2. Duplicate registration blocked
    const dupRes = await request(app)
      .post('/api/v1/auth/register')
      .send({ name: 'Alice 2', email, password });
    expect(dupRes.status).toBe(409);

    // 3. Login blocked before email verification
    const unverifiedLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(unverifiedLogin.status).toBe(403);

    // 4. Verify OTP
    const verifyRes = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email, otp, purpose: 'REGISTRATION' });
    expect(verifyRes.status).toBe(200);
    expect(verifyRes.body.data.verified).toBe(true);

    // 5. Login succeeds after verification
    const loginRes = await request(app)
      .post('/api/v1/auth/login')
      .send({ email, password });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.data.accessToken).toBeDefined();
    expect(loginRes.headers['set-cookie']).toBeDefined();
  });

  it('should reject invalid credentials', async () => {
    const { user } = await createVerifiedUserAndLogin({
      email: 'bob@workflowx.io',
      password: 'Password123!',
    });

    const badLogin = await request(app)
      .post('/api/v1/auth/login')
      .send({ email: user.email, password: 'WrongPassword!' });

    expect(badLogin.status).toBe(401);
    expect(badLogin.body.success).toBe(false);
  });

  it('should rotate refresh tokens and revoke all sessions upon reuse detection', async () => {
    const { cookies, accessToken } = await createVerifiedUserAndLogin({
      email: 'rotate@workflowx.io',
    });

    // Extract first refresh cookie
    const firstRefreshCookie = cookies[0];

    // 1. Valid refresh rotation
    const refreshRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [firstRefreshCookie]);

    expect(refreshRes.status).toBe(200);
    expect(refreshRes.body.data.accessToken).toBeDefined();
    const secondRefreshCookie = refreshRes.headers['set-cookie'][0];
    expect(secondRefreshCookie).not.toBe(firstRefreshCookie);

    // 2. Reuse OLD (already rotated) refresh token -> triggers reuse detection!
    const reuseRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [firstRefreshCookie]);

    expect(reuseRes.status).toBe(401);
    expect(reuseRes.body.message).toMatch(/reuse detected/i);

    // 3. Even the newer refresh token is now revoked for security
    const revokedRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', [secondRefreshCookie]);

    expect(revokedRes.status).toBe(401);

    // 4. Logout-all works when authenticated
    const logoutAllRes = await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(logoutAllRes.status).toBe(200);
  });

  it('should block unauthorized access to protected routes and enforce CSRF origin check', async () => {
    const meUnauth = await request(app).get('/api/v1/auth/me');
    expect(meUnauth.status).toBe(401);

    const { cookies } = await createVerifiedUserAndLogin({
      email: 'csrf@workflowx.io',
    });

    // Cross-site Origin carrying auth cookie must be blocked
    const csrfRes = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookies)
      .set('Origin', 'https://evil-attacker.com');

    expect(csrfRes.status).toBe(403);
    expect(csrfRes.body.message).toMatch(/CSRF/i);
  });
});

