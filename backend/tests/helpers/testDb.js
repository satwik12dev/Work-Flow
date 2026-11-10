import mongoose from 'mongoose';
import { setRedisClient } from '../../src/config/redis.js';
import { MockRedis } from './mockRedis.js';
import { clearTestEnqueuedJobs } from '../../src/queues/email.queue.js';

const TEST_MONGODB_URI =
  process.env.TEST_MONGODB_URI || 'mongodb://127.0.0.1:27017/workflowx_test';

export const mockRedis = new MockRedis();

export const setupTestEnvironment = async () => {
  setRedisClient(mockRedis);

  if (mongoose.connection.readyState === 0) {
    await mongoose.connect(TEST_MONGODB_URI);
  }
};

export const clearTestEnvironment = async () => {
  await mockRedis.flushall();
  clearTestEnqueuedJobs();

  if (mongoose.connection.readyState !== 0) {
    const collections = mongoose.connection.collections;
    for (const key of Object.keys(collections)) {
      await collections[key].deleteMany({});
    }
  }
};

export const teardownTestEnvironment = async () => {
  await clearTestEnvironment();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
};

