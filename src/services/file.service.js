import { Readable } from 'stream';
import { cloudinary } from '../config/cloudinary.js';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { ApiError } from '../utils/ApiError.js';

class FileService {
  _isCloudinaryConfigured() {
    return Boolean(
      config.CLOUDINARY_CLOUD_NAME &&
        config.CLOUDINARY_CLOUD_NAME !== 'your-cloud-name' &&
        config.CLOUDINARY_API_KEY &&
        config.CLOUDINARY_API_KEY !== 'your-cloudinary-api-key' &&
        config.CLOUDINARY_API_SECRET &&
        config.CLOUDINARY_API_SECRET !== 'your-cloudinary-api-secret'
    );
  }

  /**
   * Upload a file buffer from Multer to Cloudinary.
   *
   * @param {Express.Multer.File} file
   * @param {string} folder
   * @returns {Promise<{ fileUrl: string, publicId: string, resourceType: string }>}
   */
  async uploadBuffer(file, folder = 'workflowx/attachments') {
    if (!file || !file.buffer) {
      throw ApiError.badRequest('No file buffer provided for upload.');
    }

    if (!this._isCloudinaryConfigured()) {
      if (config.NODE_ENV === 'production') {
        throw ApiError.internal('File storage service is not configured.');
      }
      // Graceful local dev / test mock when Cloudinary credentials are not provided
      const mockPublicId = `${folder}/mock_${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
      logger.warn(`Cloudinary not configured. Returning mock file URL for ${file.originalname}`);
      return {
        fileUrl: `https://res.cloudinary.com/mock-cloud/raw/upload/${mockPublicId}`,
        publicId: mockPublicId,
        resourceType: 'raw',
      };
    }

    return new Promise((resolve, reject) => {
      const resourceType = file.mimetype.startsWith('image/') ? 'image' : 'raw';
      const uploadStream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: resourceType,
          use_filename: true,
          unique_filename: true,
        },
        (error, result) => {
          if (error) {
            logger.error('Cloudinary upload failed:', error);
            return reject(ApiError.internal(`File upload failed: ${error.message}`));
          }
          resolve({
            fileUrl: result.secure_url,
            publicId: result.public_id,
            resourceType: result.resource_type || resourceType,
          });
        }
      );

      Readable.from(file.buffer).pipe(uploadStream);
    });
  }

  /**
   * Delete a file from Cloudinary by publicId.
   *
   * @param {string} publicId
   * @param {string} resourceType
   */
  async deleteFile(publicId, resourceType = 'raw') {
    if (!publicId) return;

    if (!this._isCloudinaryConfigured()) {
      logger.info(`[MOCK DELETE] Skipping Cloudinary deletion for ${publicId}`);
      return;
    }

    try {
      await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
      logger.info(`Deleted Cloudinary asset: ${publicId}`);
    } catch (error) {
      logger.error(`Failed to delete Cloudinary asset ${publicId}:`, error);
      throw ApiError.internal('Failed to delete file from storage provider.');
    }
  }
}

export const fileService = new FileService();

