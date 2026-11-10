import { z } from 'zod';
import { emailSchema, passwordSchema, nameSchema } from '../../validators/common.js';
import { OTP_PURPOSES } from './auth.constants.js';

const otpPurposeSchema = z.nativeEnum(OTP_PURPOSES);

const otpCodeSchema = z
  .string()
  .trim()
  .length(6, 'Verification code must be exactly 6 digits')
  .regex(/^\d{6}$/, 'Verification code must contain only numbers');

/**
 * POST /auth/register
 */
export const registerSchema = z.object({
  body: z.object({
    name: nameSchema,
    email: emailSchema,
    password: passwordSchema,
  }),
});

/**
 * POST /auth/login
 */
export const loginSchema = z.object({
  body: z.object({
    email: emailSchema,
    password: z.string().min(1, 'Password is required'),
  }),
});

/**
 * POST /auth/change-password
 */
export const changePasswordSchema = z.object({
  body: z
    .object({
      oldPassword: z.string().min(1, 'Current password is required'),
      newPassword: passwordSchema,
    })
    .refine((data) => data.oldPassword !== data.newPassword, {
      message: 'New password must be different from the current password',
      path: ['newPassword'],
    }),
});

/**
 * POST /auth/send-otp
 */
export const sendOtpSchema = z.object({
  body: z.object({
    email: emailSchema,
    purpose: otpPurposeSchema,
  }),
});

/**
 * POST /auth/verify-otp
 */
export const verifyOtpSchema = z.object({
  body: z.object({
    email: emailSchema,
    otp: otpCodeSchema,
    purpose: otpPurposeSchema,
  }),
});

/**
 * POST /auth/resend-otp
 */
export const resendOtpSchema = z.object({
  body: z.object({
    email: emailSchema,
    purpose: otpPurposeSchema,
  }),
});

/**
 * POST /auth/forgot-password
 */
export const forgotPasswordSchema = z.object({
  body: z.object({
    email: emailSchema,
  }),
});

/**
 * POST /auth/reset-password
 */
export const resetPasswordSchema = z.object({
  body: z.object({
    resetToken: z.string().min(1, 'Reset authorization token is required'),
    newPassword: passwordSchema,
  }),
});
