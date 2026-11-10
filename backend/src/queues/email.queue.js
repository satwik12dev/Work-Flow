
import { Queue } from 'bullmq';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';

export const EMAIL_QUEUE_NAME = 'workflowx-email-queue';

const redisUrl = new URL(config.REDIS_URL);

export const redisConnectionOptions = {
  host: redisUrl.hostname,
  port: Number(redisUrl.port) || 6379,
  username: redisUrl.username
    ? decodeURIComponent(redisUrl.username)
    : undefined,
  password: redisUrl.password
    ? decodeURIComponent(redisUrl.password)
    : undefined,

  ...(redisUrl.protocol === 'rediss:' ? { tls: {} } : {}),

  maxRetriesPerRequest: null,

  retryStrategy: (times) => Math.min(times * 100, 3000),
};

let emailQueue = null;

export const getEmailQueue = () => {
  if (!emailQueue) {
    emailQueue = new Queue(EMAIL_QUEUE_NAME, {
      connection: redisConnectionOptions,

      defaultJobOptions: {
        attempts: 5,

        backoff: {
          type: 'exponential',
          delay: 5000,
        },

        removeOnComplete: {
          age: 24 * 3600,
          count: 1000,
        },

        removeOnFail: {
          age: 7 * 24 * 3600,
        },
      },
    });

    emailQueue.on('error', (error) => {
      logger.error(`Email Queue error: ${error.message}`);
    });
  }

  return emailQueue;
};

const _testEnqueuedJobs = [];

export const getTestEnqueuedJobs = () => _testEnqueuedJobs;
export const clearTestEnqueuedJobs = () => {
  _testEnqueuedJobs.length = 0;
};

export const enqueueEmailJob = async (outboxEvent) => {
  const jobId = outboxEvent.eventId;
  const jobPayload = {
    outboxId: outboxEvent._id.toString(),
    eventId: outboxEvent.eventId,
    eventType: outboxEvent.eventType,
    recipientEmail: outboxEvent.recipientEmail,
    recipientName: outboxEvent.recipientName,
    subject: outboxEvent.subject,
    payload: outboxEvent.payload,
  };

  if (config.NODE_ENV === 'test' && process.env.USE_REAL_REDIS !== 'true') {
    const existing = _testEnqueuedJobs.find((j) => j.id === jobId);
    if (existing) return existing;
    const mockJob = { id: jobId, name: outboxEvent.eventType, data: jobPayload };
    _testEnqueuedJobs.push(mockJob);
    return mockJob;
  }

  const queue = getEmailQueue();
  const job = await queue.add(outboxEvent.eventType, jobPayload, { jobId });

  logger.info(
    `Email job enqueued: ${outboxEvent.eventType} [${job.id}]`
  );

  return job;
};
