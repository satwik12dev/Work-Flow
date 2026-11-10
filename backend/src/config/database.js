import mongoose from 'mongoose';
import { config } from './index.js';
import { logger } from './logger.js';

export const connectDatabase = async () => {
  try {
    const conn = await mongoose.connect(config.MONGODB_URI, {
      // Mongoose 8 uses the new URL parser and unified topology by default
    });
    logger.info(`MongoDB connected: ${conn.connection.host}/${conn.connection.name}`);
  } catch (error) {
    logger.error('MongoDB connection failed:', error.message);
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => {
    logger.error('MongoDB connection error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB disconnected');
  });
};

export const disconnectDatabase = async () => {
  await mongoose.disconnect();
  logger.info('MongoDB disconnected gracefully');
};

