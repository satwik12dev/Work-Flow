import { Queue } from 'bullmq';
import { redisConnectionOptions } from './email.queue.js';
import { logger } from '../config/logger.js';

export const DEADLINE_QUEUE_NAME = 'workflowx-deadline-queue';

let _deadlineQueue = null;

export const getDeadlineQueue = () => {
  if (!_deadlineQueue) {
    _deadlineQueue = new Queue(DEADLINE_QUEUE_NAME, {
      connection: redisConnectionOptions,
      defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: 100,
      },
    });

    _deadlineQueue.on('error', (err) => {
      logger.warn(`Deadline Queue connection issue: ${err.message}`);
    });
  }
  return _deadlineQueue;
};

/**
 * Schedule a recurring deadline & overdue scan job (runs every hour).
 */
export const scheduleDeadlineChecks = async () => {
  const queue = getDeadlineQueue();
  await queue.add(
    'check-deadlines',
    {},
    {
      repeat: { every: 60 * 60 * 1000 }, // every hour
      jobId: 'recurring-deadline-check',
    }
  );
  logger.info('Scheduled hourly deadline reminder & overdue scan job');
};

