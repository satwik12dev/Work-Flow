import { connectDatabase, disconnectDatabase } from '../config/database.js';
import { connectRedis, disconnectRedis } from '../config/redis.js';
import { logger } from '../config/logger.js';
import { startEmailWorker } from './email.worker.js';
import { startDeadlineWorker } from './deadline.worker.js';
import { scheduleDeadlineChecks } from '../queues/deadline.queue.js';

const startWorkers = async () => {
  try {
    logger.info('Starting WorkFlowX Background Workers...');
    await connectDatabase();
    connectRedis();

    const emailWorker = startEmailWorker();
    const deadlineWorker = startDeadlineWorker();
    await scheduleDeadlineChecks();

    const gracefulShutdown = async (signal) => {
      logger.info(`${signal} received. Closing workers...`);
      try {
        await emailWorker.close();
        await deadlineWorker.close();
        await disconnectDatabase();
        await disconnectRedis();
        logger.info('Workers closed cleanly. Exiting.');
        process.exit(0);
      } catch (err) {
        logger.error('Error during worker shutdown:', err);
        process.exit(1);
      }
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  } catch (error) {
    logger.error('Failed to initialize background workers:', error);
    process.exit(1);
  }
};

startWorkers();

