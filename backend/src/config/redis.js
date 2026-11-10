import Redis from 'ioredis';
import { config } from './index.js';
import { logger } from './logger.js';

/** @type {Redis | null} */
let redisClient = null;

/**
 * Create and return the singleton Redis client.
 * BullMQ requires `maxRetriesPerRequest: null`.
 */
export const connectRedis = () => {
  redisClient = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    retryStrategy(times) {
      const delay = Math.min(times * 50, 2000);
      return delay;
    },
  });

  redisClient.on('connect', () => {
    logger.info('Redis connected');
  });

  redisClient.on('error', (err) => {
    logger.error('Redis connection error:', err.message);
  });

  redisClient.on('close', () => {
    logger.warn('Redis connection closed');
  });

  return redisClient;
};

/**
 * Override the Redis client (useful for automated tests with an in-memory Redis mock).
 * @param {object} client
 */
export const setRedisClient = (client) => {
  redisClient = client;
};

/**
 * Get the existing Redis client instance.
 * @returns {Redis}
 */
export const getRedisClient = () => {
  if (!redisClient) {
    throw new Error('Redis client not initialized. Call connectRedis() first.');
  }
  return redisClient;
};

/**
 * Gracefully disconnect Redis.
 */
export const disconnectRedis = async () => {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis disconnected gracefully');
  }
};

