import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import {
  setupTestEnvironment,
  clearTestEnvironment,
  teardownTestEnvironment,
} from '../helpers/testDb.js';
import { createVerifiedUserAndLogin, createOrgForUser } from '../helpers/authHelper.js';
import { OrganizationMember } from '../../src/modules/organizations/organizationMember.model.js';
import { ROLES } from '../../src/constants/roles.js';

describe('RBAC & Multi-Tenant Organization Isolation Tests', () => {
  beforeAll(async () => {
    await setupTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment();
  });

  it('should enforce strict organization isolation and prevent cross-tenant access', async () => {
    const org1Owner = await createVerifiedUserAndLogin({ email: 'owner1@org1.com' });
    const org2Owner = await createVerifiedUserAndLogin({ email: 'owner2@org2.com' });

    const org1 = await createOrgForUser(org1Owner.accessToken, 'Org One');
    const org2 = await createOrgForUser(org2Owner.accessToken, 'Org Two');

    // Org 1 owner creates a project in Org 1
    const projRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${org1Owner.accessToken}`)
      .set('X-Organization-Id', org1._id)
      .send({ name: 'Confidential Org1 Project', priority: 'HIGH' });

    expect(projRes.status).toBe(201);
    const org1ProjectId = projRes.body.data.project._id;

    // Org 2 owner tries to access Org 1's project using Org 1 header -> 403 Forbidden
    const crossHeaderAttempt = await request(app)
      .get(`/api/v1/projects/${org1ProjectId}`)
      .set('Authorization', `Bearer ${org2Owner.accessToken}`)
      .set('X-Organization-Id', org1._id);

    expect(crossHeaderAttempt.status).toBe(403);

    // Org 2 owner tries to access Org 1's project using Org 2 header -> 404 Not Found (isolated query)
    const crossIdAttempt = await request(app)
      .get(`/api/v1/projects/${org1ProjectId}`)
      .set('Authorization', `Bearer ${org2Owner.accessToken}`)
      .set('X-Organization-Id', org2._id);

    expect(crossIdAttempt.status).toBe(404);
  });

  it('should enforce RBAC permissions for ADMIN, MANAGER, and EMPLOYEE', async () => {
    const admin = await createVerifiedUserAndLogin({ email: 'admin@acme.com' });
    const manager = await createVerifiedUserAndLogin({ email: 'manager@acme.com' });
    const employee = await createVerifiedUserAndLogin({ email: 'emp@acme.com' });

    const org = await createOrgForUser(admin.accessToken, 'Acme RBAC Org');

    // Admin directly adds manager and employee via REST API with roles
    const addMgrRes = await request(app)
      .post(`/api/v1/organizations/${org._id}/members`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Organization-Id', org._id)
      .send({ email: 'manager@acme.com', role: ROLES.MANAGER });
    expect(addMgrRes.status).toBe(201);

    const addEmpRes = await request(app)
      .post(`/api/v1/organizations/${org._id}/members`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Organization-Id', org._id)
      .send({ userId: employee.user._id, role: ROLES.EMPLOYEE });
    expect(addEmpRes.status).toBe(201);

    // Duplicate add returns 409
    const dupAddRes = await request(app)
      .post(`/api/v1/organizations/${org._id}/members`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Organization-Id', org._id)
      .send({ userId: employee.user._id, role: ROLES.EMPLOYEE });
    expect(dupAddRes.status).toBe(409);

    // 1. Employee CANNOT create a project
    const empCreateProj = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .set('X-Organization-Id', org._id)
      .send({ name: 'Unauthorized Project' });
    expect(empCreateProj.status).toBe(403);

    // 2. Manager CAN create a project
    const mgrCreateProj = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .set('X-Organization-Id', org._id)
      .send({ name: 'Manager Project', status: 'PLANNING' });
    expect(mgrCreateProj.status).toBe(201);
    const projectId = mgrCreateProj.body.data.project._id;

    // 3. Manager CANNOT delete a project (Admin only)
    const mgrDeleteProj = await request(app)
      .delete(`/api/v1/projects/${projectId}`)
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .set('X-Organization-Id', org._id);
    expect(mgrDeleteProj.status).toBe(403);

    // 4. Manager CAN transition project status
    const mgrStatusProj = await request(app)
      .patch(`/api/v1/projects/${projectId}/status`)
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .set('X-Organization-Id', org._id)
      .send({ status: 'ACTIVE' });
    expect(mgrStatusProj.status).toBe(200);
    expect(mgrStatusProj.body.data.project.status).toBe('ACTIVE');

    // 5. Employee CANNOT access organization-wide analytics
    const empAnalytics = await request(app)
      .get('/api/v1/analytics/organization')
      .set('Authorization', `Bearer ${employee.accessToken}`)
      .set('X-Organization-Id', org._id);
    expect(empAnalytics.status).toBe(403);

    // 6. Admin CAN access organization-wide analytics
    const adminAnalytics = await request(app)
      .get('/api/v1/analytics/organization')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .set('X-Organization-Id', org._id);
    expect(adminAnalytics.status).toBe(200);
    expect(adminAnalytics.body.data.analytics.totalEmployees).toBe(3);
  });
});

