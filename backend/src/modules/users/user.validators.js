import { z } from 'zod';
import { nameSchema, paginationSchema, searchSchema } from '../../validators/common.js';

export const updateProfileSchema = z.object({
  body: z.object({
    name: nameSchema.optional(),
  }),
});

export const searchUsersSchema = z.object({
  query: searchSchema.merge(paginationSchema),
});

