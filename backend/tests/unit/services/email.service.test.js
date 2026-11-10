import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { emailService } from '../../../src/services/email.service.js';

describe('Email Service Unit Tests (Mocked Brevo API)', () => {
  let sendTransacEmailMock;

  beforeEach(() => {
    sendTransacEmailMock = jest.fn().mockResolvedValue({
      body: { messageId: '<brevo-mock-msg-id-123@smtp-relay.mailin.fr>' },
    });
    emailService.apiInstance = { sendTransacEmail: sendTransacEmailMock };
    emailService.isConfigured = true;
  });

  it('should send a task assignment email via mocked Brevo SDK with all required details', async () => {
    const result = await emailService.sendTaskAssignmentEmail({
      to: 'employee@acme.com',
      employeeName: 'Jane Doe',
      taskTitle: 'Build RBAC Middleware',
      taskDescription: 'Enforce organization isolation',
      projectName: 'WorkFlowX Core',
      priority: 'HIGH',
      dueDate: '2026-12-15T00:00:00.000Z',
      assignedBy: 'John Manager',
      taskId: '6731b8000000000000000001',
    });

    expect(result.status).toBe('SENT');
    expect(result.messageId).toBe('<brevo-mock-msg-id-123@smtp-relay.mailin.fr>');
    expect(sendTransacEmailMock).toHaveBeenCalledTimes(1);

    const payload = sendTransacEmailMock.mock.calls[0][0];
    expect(payload.to[0].email).toBe('employee@acme.com');
    expect(payload.subject).toContain('Build RBAC Middleware');
    expect(payload.htmlContent).toContain('Jane Doe');
    expect(payload.htmlContent).toContain('WorkFlowX Core');
    expect(payload.htmlContent).toContain('HIGH');
    expect(payload.htmlContent).toContain('John Manager');
  });

  it('should propagate Brevo API errors cleanly for BullMQ retry handling', async () => {
    sendTransacEmailMock.mockRejectedValue({
      response: { statusCode: 429, body: { message: 'Rate limit exceeded' } },
    });

    await expect(
      emailService.sendEmail({
        to: 'user@example.com',
        subject: 'Test',
        htmlContent: '<p>Hi</p>',
      })
    ).rejects.toThrow(/Email delivery failed: Rate limit exceeded/);
  });
});

