import * as brevo from '@getbrevo/brevo';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { templateService } from './template.service.js';

class EmailService {
  constructor() {
    this.apiInstance = new brevo.TransactionalEmailsApi();
    if (config.BREVO_API_KEY && config.BREVO_API_KEY !== 'your-brevo-api-key') {
      this.apiInstance.setApiKey(
        brevo.TransactionalEmailsApiApiKeys.apiKey,
        config.BREVO_API_KEY
      );
      this.isConfigured = true;
    } else {
      this.isConfigured = false;
      logger.warn('Brevo API key not configured. Emails will be logged in mock mode.');
    }
  }

  /**
   * Send a transactional email via Brevo.
   * @param {{ to: string, name?: string, subject: string, htmlContent: string }} options
   * @returns {Promise<{ messageId: string, status: string }>}
   */
  async sendEmail({ to, name = '', subject, htmlContent }) {
    if (!this.isConfigured) {
      const mockId = `mock-brevo-${Date.now()}`;
      logger.info(`[MOCK EMAIL TO: ${to}] Subject: "${subject}" | Provider ID: ${mockId}`);
      return { messageId: mockId, status: 'SENT' };
    }

    try {
      const sendSmtpEmail = new brevo.SendSmtpEmail();
      sendSmtpEmail.subject = subject;
      sendSmtpEmail.htmlContent = htmlContent;
      sendSmtpEmail.sender = {
        name: config.BREVO_SENDER_NAME,
        email: config.BREVO_SENDER_EMAIL,
      };
      sendSmtpEmail.to = [{ email: to, name }];

      const response = await this.apiInstance.sendTransacEmail(sendSmtpEmail);
      const messageId = response?.body?.messageId || response?.messageId || `brevo-${Date.now()}`;

      logger.info(`Email sent successfully to ${to}. MessageId: ${messageId}`);
      return { messageId, status: 'SENT' };
    } catch (error) {
      const errorMsg = error?.response?.body?.message || error.message || 'Brevo API Error';
      logger.error(`Brevo email delivery failed to ${to}: ${errorMsg}`, {
        statusCode: error?.response?.statusCode,
      });
      throw new Error(`Email delivery failed: ${errorMsg}`);
    }
  }

  /**
   * Send OTP Verification Email.
   */
  async sendOtpEmail({ to, name, otp, purpose }) {
    const htmlContent = await templateService.render('otpVerification.html', {
      name,
      otp,
      purpose: purpose.replace(/_/g, ' '),
      expiryMinutes: Math.round(config.OTP_EXPIRY_SECONDS / 60),
    });

    return this.sendEmail({
      to,
      name,
      subject: `WorkFlowX - Verification Code: ${otp}`,
      htmlContent,
    });
  }

  /**
   * Send Password Reset Email.
   */
  async sendPasswordResetEmail({ to, name, otp }) {
    const htmlContent = await templateService.render('passwordReset.html', {
      name,
      otp,
      expiryMinutes: Math.round(config.OTP_EXPIRY_SECONDS / 60),
    });

    return this.sendEmail({
      to,
      name,
      subject: 'WorkFlowX - Password Reset Request',
      htmlContent,
    });
  }

  /**
   * Send Task Assignment Email.
   */
  async sendTaskAssignmentEmail({
    to,
    employeeName,
    taskTitle,
    taskDescription,
    projectName,
    priority,
    dueDate,
    assignedBy,
    taskId,
  }) {
    const taskUrl = `${config.CLIENT_URL}/tasks/${taskId}`;
    const htmlContent = await templateService.render('taskAssignment.html', {
      employeeName,
      taskTitle,
      taskDescription: taskDescription || 'No description provided.',
      projectName,
      priority,
      dueDate: dueDate ? new Date(dueDate).toLocaleDateString() : 'No deadline',
      assignedBy,
      taskUrl,
    });

    return this.sendEmail({
      to,
      name: employeeName,
      subject: `[WorkFlowX] New Task Assigned: ${taskTitle}`,
      htmlContent,
    });
  }

  /**
   * Send Task Reassignment Email.
   */
  async sendTaskReassignmentEmail({
    to,
    employeeName,
    taskTitle,
    projectName,
    priority,
    dueDate,
    reassignedBy,
    taskId,
  }) {
    const taskUrl = `${config.CLIENT_URL}/tasks/${taskId}`;
    const htmlContent = await templateService.render('taskReassignment.html', {
      employeeName,
      taskTitle,
      projectName,
      priority,
      dueDate: dueDate ? new Date(dueDate).toLocaleDateString() : 'No deadline',
      reassignedBy,
      taskUrl,
    });

    return this.sendEmail({
      to,
      name: employeeName,
      subject: `[WorkFlowX] Task Reassigned to You: ${taskTitle}`,
      htmlContent,
    });
  }

  /**
   * Send Organization Invitation Email.
   */
  async sendOrgInvitationEmail({
    to,
    organizationName,
    invitedBy,
    role,
    inviteToken,
  }) {
    const inviteUrl = `${config.CLIENT_URL}/invitations/${inviteToken}`;
    const htmlContent = await templateService.render('orgInvitation.html', {
      organizationName,
      invitedBy,
      role,
      inviteUrl,
      expiresInDays: 7,
    });

    return this.sendEmail({
      to,
      subject: `[WorkFlowX] Invitation to join ${organizationName}`,
      htmlContent,
    });
  }

  /**
   * Send Deadline Reminder Email.
   */
  async sendDeadlineReminderEmail({
    to,
    employeeName,
    taskTitle,
    projectName,
    dueDate,
    taskId,
  }) {
    const taskUrl = `${config.CLIENT_URL}/tasks/${taskId}`;
    const htmlContent = await templateService.render('deadlineReminder.html', {
      employeeName,
      taskTitle,
      projectName,
      dueDate: new Date(dueDate).toLocaleDateString(),
      taskUrl,
    });

    return this.sendEmail({
      to,
      name: employeeName,
      subject: `[WorkFlowX] Reminder: Task Due Soon - ${taskTitle}`,
      htmlContent,
    });
  }
}

export const emailService = new EmailService();

