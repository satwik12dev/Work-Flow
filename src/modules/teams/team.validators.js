import { z } from 'zod';
import { objectIdSchema, paginationSchema, searchSchema } from '../../validators/common.js';

export const createTeamSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Team name must be at least 2 characters').max(100),
    description: z.string().trim().max(500).optional(),
    managerId: objectIdSchema.optional(),
  }),
});

export const updateTeamSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    managerId: objectIdSchema.nullable().optional(),
  }),
});

export const addTeamMemberSchema = z.object({
  body: z.object({
    userId: objectIdSchema,
  }),
});

export const assignTeamManagerSchema = z.object({
  body: z.object({
    managerId: objectIdSchema,
  }),
});

export const teamMemberParamsSchema = z.object({
  params: z.object({
    id: objectIdSchema,
    userId: objectIdSchema,
  }),
});

export const listTeamsQuerySchema = z.object({
  query: searchSchema.merge(paginationSchema).extend({
    managerId: objectIdSchema.optional(),
  }),
});

