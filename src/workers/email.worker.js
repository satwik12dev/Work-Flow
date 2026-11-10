
import 'dotenv/config';

import mongoose from 'mongoose';
import { Worker } from 'bullmq';

import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { EMAIL_QUEUE_NAME, redisConnectionOptions } from '../queues/email.queue.js';
import { emailService } from '../services/email.service.js';
import { EmailOutbox } from '../models/emailOutbox.model.js';

/**
 * Process a single email job from BullMQ.
 */
export const processEmailJob = async (job) => {
  const {
    outboxId,
    eventType,
    recipientEmail,
    recipientName,
    payload,
  } = job.data;

  logger.info(
    `Processing email job [${job.id}] - ${eventType} to ${recipientEmail}`
  );

  let outbox = null;

  try {
    if (outboxId) {
      outbox = await EmailOutbox.findById(outboxId);

      if (!outbox) {
        throw new Error(`Email outbox record not found: ${outboxId}`);
      }
    }

    let result;

    switch (eventType) {
      case 'OTP_VERIFICATION':
        result = await emailService.sendOtpEmail({
          to: recipientEmail,
          name: recipientName,
          otp: payload.otp,
          purpose: payload.purpose,
        });
        break;

      case 'PASSWORD_RESET':
        result = await emailService.sendPasswordResetEmail({
          to: recipientEmail,
          name: recipientName,
          otp: payload.otp,
        });
        break;

      case 'TASK_ASSIGNED':
        result = await emailService.sendTaskAssignmentEmail({
          to: recipientEmail,
          employeeName: recipientName,
          taskTitle: payload.taskTitle,
          taskDescription: payload.taskDescription,
          projectName: payload.projectName,
          priority: payload.priority,
          dueDate: payload.dueDate,
          assignedBy: payload.assignedBy,
          taskId: payload.taskId,
        });
        break;

      case 'TASK_REASSIGNED':
        result = await emailService.sendTaskReassignmentEmail({
          to: recipientEmail,
          employeeName: recipientName,
          taskTitle: payload.taskTitle,
          projectName: payload.projectName,
          priority: payload.priority,
          dueDate: payload.dueDate,
          reassignedBy: payload.reassignedBy,
          taskId: payload.taskId,
        });
        break;

      case 'ORG_INVITATION':
        result = await emailService.sendOrgInvitationEmail({
          to: recipientEmail,
          organizationName: payload.organizationName,
          invitedBy: payload.invitedBy,
          role: payload.role,
          inviteToken: payload.inviteToken,
        });
        break;

      case 'DEADLINE_REMINDER':
        result = await emailService.sendDeadlineReminderEmail({
          to: recipientEmail,
          employeeName: recipientName,
          taskTitle: payload.taskTitle,
          projectName: payload.projectName,
          dueDate: payload.dueDate,
          taskId: payload.taskId,
        });
        break;

      default:
        throw new Error(`Unknown email event type: ${eventType}`);
    }

    // Mark email as successfully sent.
    if (outbox) {
      outbox.status = 'SENT';
      outbox.providerMessageId = result.messageId;
      outbox.processedAt = new Date();
      outbox.lastError = null;

      await outbox.save();
    }

    logger.info(
      `Email job [${job.id}] sent successfully. Provider ID: ${result.messageId}`
    );

    return result;

  } catch (error) {
    logger.error(
      `Email job [${job.id}] failed: ${error.message}`,
      error
    );

    if (outbox) {
      outbox.retryCount = job.attemptsMade + 1;
      outbox.lastError = error.message;

      const maxAttempts = job.opts?.attempts || 5;

      if (job.attemptsMade + 1 >= maxAttempts) {
        outbox.status = 'FAILED';
      }

      await outbox.save();
    }

    throw error;
  }
};

/**
 * Initialize BullMQ email worker.
 */
export const startEmailWorker = () => {
  const worker = new Worker(
    EMAIL_QUEUE_NAME,
    processEmailJob,
    {
      connection: redisConnectionOptions,
      concurrency: 5,
    }
  );

  worker.on('completed', (job) => {
    logger.info(`Email job ${job.id} completed successfully.`);
  });

  worker.on('failed', (job, error) => {
    logger.error(
      `Email job ${job?.id} failed. Attempts: ${job?.attemptsMade}. Error: ${error.message}`
    );
  });

  worker.on('error', (error) => {
    logger.error('BullMQ worker error:', error);
  });

  logger.info(
    `BullMQ Email Worker listening on ${EMAIL_QUEUE_NAME}`
  );

  return worker;
};

/**
 * Bootstrap worker application.
 */
const bootstrap = async () => {
  try {
    // Validate environment configuration.
    if (!config.MONGODB_URI) {
      throw new Error('MONGODB_URI is missing');
    }

    // Connect MongoDB independently.
    await mongoose.connect(config.MONGODB_URI);

    logger.info('MongoDB connected successfully.');

    // Start BullMQ worker.
    const worker = startEmailWorker();

    logger.info('WorkFlowX Email Worker is running.');

    // Graceful shutdown.
    let shuttingDown = false;

    const shutdown = async (signal) => {
      if (shuttingDown) return;

      shuttingDown = true;

      logger.info(`Received ${signal}. Shutting down worker...`);

      try {
        await worker.close();
        await mongoose.disconnect();

        logger.info('Email worker shut down successfully.');
        process.exit(0);
      } catch (error) {
        logger.error('Worker shutdown failed:', error);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Email worker startup failed:', error);

    await mongoose.disconnect().catch(() => { });

    process.exit(1);
  }
};

// Start worker.
bootstrap();
