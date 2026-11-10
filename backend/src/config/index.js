import dotenv from 'dotenv';

import { z } from 'zod';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({
  path: path.resolve(__dirname, '../../.env'),
});


const envSchema = z.object({
  // Server
  PORT: z.string().default('5000'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // MongoDB
  MONGODB_URI: z.string().min(1, 'MONGODB_URI is required'),

  // JWT
  JWT_ACCESS_SECRET: z.string().min(1, 'JWT_ACCESS_SECRET is required'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  JWT_ACCESS_EXPIRES: z.string().default('15m'),
  JWT_REFRESH_EXPIRES: z.string().default('7d'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // OTP
  OTP_SECRET: z.string().min(1, 'OTP_SECRET is required'),
  OTP_EXPIRY_SECONDS: z.coerce.number().int().positive().default(300),
  OTP_RESEND_COOLDOWN: z.coerce.number().int().positive().default(60),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // Brevo Email
  BREVO_API_KEY: z.string().optional().default(''),
  BREVO_SENDER_EMAIL: z.string().optional().default(''),
  BREVO_SENDER_NAME: z.string().default('WorkFlowX'),
  BREVO_API_URL: z.string().default('https://api.brevo.com/v3/smtp/email'),

  // Cloudinary
  CLOUDINARY_CLOUD_NAME: z.string().optional().default(''),
  CLOUDINARY_API_KEY: z.string().optional().default(''),
  CLOUDINARY_API_SECRET: z.string().optional().default(''),

  // URLs & SSL
  CLIENT_URL: z.string().default('http://localhost:3000'),
  APP_URL: z.string().default('http://localhost:5000'),
  SSL_KEY_PATH: z.string().optional().default(''),
  SSL_CERT_PATH: z.string().optional().default(''),
  DISABLE_HTTPS_REDIRECT: z
    .enum(['true', 'false'])
    .optional()
    .default('false')
    .transform((v) => v === 'true'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Invalid environment variables:');
  const errors = parsed.error.flatten().fieldErrors;
  for (const [field, messages] of Object.entries(errors)) {
    console.error(`  ${field}: ${messages.join(', ')}`);
  }
  process.exit(1);
}

// Enforce strong non-placeholder secrets in production
if (parsed.data.NODE_ENV === 'production') {
  const secretFields = ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET', 'OTP_SECRET'];
  for (const field of secretFields) {
    const val = parsed.data[field];
    if (val.length < 32 || val.includes('change-in-production')) {
      console.error(
        `❌ Security error: ${field} must be at least 32 characters and not a default placeholder in production.`
      );
      process.exit(1);
    }
  }
}

export const config = Object.freeze(parsed.data);

