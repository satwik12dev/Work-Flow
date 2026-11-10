import { v2 as cloudinary } from 'cloudinary';
import { config } from './index.js';
import { logger } from './logger.js';

/**
 * Configure the Cloudinary SDK.
 * Silently skips if credentials are not provided (allows local dev without uploads).
 */
export const configureCloudinary = () => {
  if (!config.CLOUDINARY_CLOUD_NAME || !config.CLOUDINARY_API_KEY || !config.CLOUDINARY_API_SECRET) {
    logger.warn('Cloudinary credentials not configured. File uploads will be unavailable.');
    return;
  }

  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET,
  });

  logger.info('Cloudinary configured');
};

export { cloudinary };

