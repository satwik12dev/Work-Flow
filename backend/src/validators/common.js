import { z } from 'zod';

// ── Reusable Atomic Schemas ────────────────────────────────────

/**
 * MongoDB ObjectId string (24-char hex).
 */
export const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid ObjectId');

/**
 * Standard pagination query parameters.
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  sortBy: z.string().trim().max(50).optional().default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * Generic text-search query parameter.
 */
export const searchSchema = z.object({
  search: z.string().trim().max(200).optional(),
});

/**
 * Params object containing a single `:id` route parameter.
 */
export const idParamSchema = z.object({
  params: z.object({
    id: objectIdSchema,
  }),
});

/**
 * Strong password: ≥ 8 chars, at least one uppercase, one lowercase,
 * one digit, one special character.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

/**
 * Email – trimmed and lowercased.
 */
export const emailSchema = z
  .string()
  .email('Invalid email address')
  .trim()
  .toLowerCase()
  .max(255);

/**
 * Human-readable name.
 */
export const nameSchema = z
  .string()
  .trim()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name must be at most 100 characters');

