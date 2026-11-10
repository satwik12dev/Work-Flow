import { describe, it, expect, jest, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import app from '../../src/app.js';
import {
  setupTestEnvironment,
  clearTestEnvironment,
  teardownTestEnvironment,
} from '../helpers/testDb.js';
import { createVerifiedUserAndLogin, createOrgForUser } from '../helpers/authHelper.js';
import { OrganizationMember } from '../../src/modules/organizations/organizationMember.model.js';
import { EmailOutbox } from '../../src/models/emailOutbox.model.js';
import { getTestEnqueuedJobs, clearTestEnqueuedJobs } from '../../src/queues/email.queue.js';
import { processEmailJob } from '../../src/workers/email.worker.js';
import { emailService } from '../../src/services/email.service.js';
import { ROLES } from '../../src/constants/roles.js';

describe('Task Assignment, Email Outbox, Duplicate Prevention & Notifications Tests', () => {
  beforeAll(async () => {
    await setupTestEnvironment();
  });

  beforeEach(async () => {
    await clearTestEnvironment();
  });

  afterAll(async () => {
    await teardownTestEnvironment();
  });

  it('should create task with Outbox email job, deliver via worker with mocked Brevo, prevent duplicate emails on unrelated edits, and emit notifications', async () => {
    const manager = await createVerifiedUserAndLogin({
      name: 'Manager Mike',
      email: 'mike@acme.com',
    });
    const emp1 = await createVerifiedUserAndLogin({
      name: 'Dev One',
      email: 'dev1@acme.com',
    });
    const emp2 = await createVerifiedUserAndLogin({
      name: 'Dev Two',
      email: 'dev2@acme.com',
    });

    const org = await createOrgForUser(manager.accessToken, 'Acme Dev Org');

    await OrganizationMember.create([
      { organizationId: org._id, userId: emp1.user._id, role: ROLES.EMPLOYEE },
      { organizationId: org._id, userId: emp2.user._id, role: ROLES.EMPLOYEE },
    ]);

    // Create project and add both employees
    const projRes = await request(app)
      .post('/api/v1/projects')
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .set('X-Organization-Id', org._id)
      .send({ name: 'Core API' });
    const projectId = projRes.body.data.project._id;

    for (const emp of [emp1, emp2]) {
      await request(app)
        .post(`/api/v1/projects/${projectId}/members`)
        .set('Authorization', `Bearer ${manager.accessToken}`)
        .set('X-Organization-Id', org._id)
        .send({ userId: emp.user._id });
    }

    clearTestEnqueuedJobs();

    // 1. Create & assign task to emp1
    const taskRes = await request(app)
      .post('/api/v1/tasks')
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .set('X-Organization-Id', org._id)
      .send({
        title: 'Setup BullMQ Worker',
        description: 'Implement async email worker',
        projectId,
        assignedTo: emp1.user._id,
        priority: 'HIGH',
        dueDate: '2026-12-30T00:00:00.000Z',
      });

    expect(taskRes.status).toBe(201);
    const taskId = taskRes.body.data.task._id;

    // Verify BullMQ job & Outbox created
    let jobs = getTestEnqueuedJobs();
    expect(jobs.length).toBe(1);
    expect(jobs[0].name).toBe('TASK_ASSIGNED');
    expect(jobs[0].data.recipientEmail).toBe('dev1@acme.com');

    // Mock Brevo SDK and run worker processor on job
    const sendTransacEmailMock = jest.fn().mockResolvedValue({
      body: { messageId: 'brevo-msg-001' },
    });
    emailService.apiInstance = { sendTransacEmail: sendTransacEmailMock };
    emailService.isConfigured = true;

    await processEmailJob(jobs[0]);
    expect(sendTransacEmailMock).toHaveBeenCalledTimes(1);

    const outboxAfterSend = await EmailOutbox.findOne({ eventId: jobs[0].id });
    expect(outboxAfterSend.status).toBe('SENT');
    expect(outboxAfterSend.providerMessageId).toBe('brevo-msg-001');

    // 2. Verify emp1 received both PROJECT_MEMBER_ADDED and TASK_ASSIGNED notifications
    const unreadRes = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${emp1.accessToken}`)
      .set('X-Organization-Id', org._id);
    expect(unreadRes.status).toBe(200);
    expect(unreadRes.body.data.unreadCount).toBe(2);

    const readAllRes = await request(app)
      .patch('/api/v1/notifications/read-all')
      .set('Authorization', `Bearer ${emp1.accessToken}`)
      .set('X-Organization-Id', org._id);
    expect(readAllRes.status).toBe(200);

    const unreadAfterReadAll = await request(app)
      .get('/api/v1/notifications/unread-count')
      .set('Authorization', `Bearer ${emp1.accessToken}`)
      .set('X-Organization-Id', org._id);
    expect(unreadAfterReadAll.body.data.unreadCount).toBe(0);

    // 3. Unrelated task field update MUST NOT enqueue duplicate assignment email
    const updateRes = await request(app)
      .patch(`/api/v1/tasks/${taskId}`)
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .set('X-Organization-Id', org._id)
      .send({ title: 'Setup BullMQ Worker v2', priority: 'URGENT' });

    expect(updateRes.status).toBe(200);
    expect(getTestEnqueuedJobs().length).toBe(1); // Still only 1 job!

    // 4. Reassigning to the SAME employee MUST NOT enqueue duplicate email
    const sameAssignRes = await request(app)
      .patch(`/api/v1/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .set('X-Organization-Id', org._id)
      .send({ assignedTo: emp1.user._id });
    expect(sameAssignRes.status).toBe(200);
    expect(getTestEnqueuedJobs().length).toBe(1);

    // 5. Reassigning to emp2 triggers TASK_REASSIGNED email & notification
    const reassignRes = await request(app)
      .patch(`/api/v1/tasks/${taskId}/assign`)
      .set('Authorization', `Bearer ${manager.accessToken}`)
      .set('X-Organization-Id', org._id)
      .send({ assignedTo: emp2.user._id });
    expect(reassignRes.status).toBe(200);

    jobs = getTestEnqueuedJobs();
    expect(jobs.length).toBe(2);
    expect(jobs[1].name).toBe('TASK_REASSIGNED');
    expect(jobs[1].data.recipientEmail).toBe('dev2@acme.com');

    // 6. emp2 updates status and checks dashboard analytics
    const statusRes = await request(app)
      .patch(`/api/v1/tasks/${taskId}/status`)
      .set('Authorization', `Bearer ${emp2.accessToken}`)
      .set('X-Organization-Id', org._id)
      .send({ status: 'IN_PROGRESS' });
    expect(statusRes.status).toBe(200);

    const dashRes = await request(app)
      .get('/api/v1/analytics/my-dashboard')
      .set('Authorization', `Bearer ${emp2.accessToken}`)
      .set('X-Organization-Id', org._id);
    expect(dashRes.status).toBe(200);
    expect(dashRes.body.data.analytics.inProgressTasks).toBe(1);
  });
});

