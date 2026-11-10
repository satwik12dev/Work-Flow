import multer from 'multer';
import { ApiError } from '../utils/ApiError.js';

/**
 * Allowed MIME types for task attachments.
 */
const ALLOWED_MIME_TYPES = new Set([
  // Images
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  // Documents
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  // Archives
  'application/zip',
  'application/gzip',
  // Text
  'text/plain',
  'text/csv',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const DANGEROUS_EXTENSIONS = new Set([
  '.exe',
  '.bat',
  '.cmd',
  '.sh',
  '.ps1',
  '.msi',
  '.js',
  '.mjs',
  '.cjs',
  '.html',
  '.htm',
  '.php',
]);

/**
 * Multer storage: memory (buffer) — we upload to Cloudinary from memory.
 */
const storage = multer.memoryStorage();

/**
 * File filter that rejects disallowed MIME types and dangerous extensions.
 */
const fileFilter = (_req, file, cb) => {
  const lowerName = (file.originalname || '').toLowerCase();
  const hasDangerousExt = Array.from(DANGEROUS_EXTENSIONS).some((ext) =>
    lowerName.endsWith(ext)
  );

  if (hasDangerousExt) {
    return cb(new ApiError(400, 'Potentially unsafe file extension is not allowed'), false);
  }

  if (ALLOWED_MIME_TYPES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new ApiError(400, `File type ${file.mimetype} is not allowed`), false);
  }
};

/**
 * Pre-configured Multer instance.
 */
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 5, // max files per request
  },
});

