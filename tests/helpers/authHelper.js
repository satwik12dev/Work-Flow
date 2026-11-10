import request from 'supertest';
import app from '../../src/app.js';
import { User } from '../../src/modules/users/user.model.js';

/**
 * Register a user, mark email as verified (or verify via OTP), and return { user, accessToken, cookies }.
 */
export const createVerifiedUserAndLogin = async ({
  name = 'Test User',
  email = `user-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
  password = 'StrongPassword123!',
} = {}) => {
  const registerRes = await request(app)
    .post('/api/v1/auth/register')
    .send({ name, email, password });

  if (registerRes.status !== 201) {
    throw new Error(`Register failed: ${JSON.stringify(registerRes.body)}`);
  }

  await User.updateOne({ email: email.toLowerCase() }, { isEmailVerified: true });

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email, password });

  if (loginRes.status !== 200) {
    throw new Error(`Login failed: ${JSON.stringify(loginRes.body)}`);
  }

  return {
    user: loginRes.body.data.user,
    accessToken: loginRes.body.data.accessToken,
    cookies: loginRes.headers['set-cookie'],
    password,
  };
};

/**
 * Create an organization for an authenticated user and return the organization object.
 */
export const createOrgForUser = async (accessToken, name = 'Acme Test Org') => {
  const res = await request(app)
    .post('/api/v1/organizations')
    .set('Authorization', `Bearer ${accessToken}`)
    .send({ name, description: 'Test Organization' });

  if (res.status !== 201) {
    throw new Error(`Create Org failed: ${JSON.stringify(res.body)}`);
  }

  return res.body.data.organization;
};

