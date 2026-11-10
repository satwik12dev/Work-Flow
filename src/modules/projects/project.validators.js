import { z } from 'zod';
import { objectIdSchema, paginationSchema, searchSchema } from '../../validators/common.js';
import { ALL_PROJECT_STATUSES } from '../../constants/projectStatus.js';
import { ALL_PRIORITIES } from '../../constants/priorities.js';

export const createProjectSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Project name must be at least 2 characters').max(120),
    description: z.string().trim().max(1000).optional(),
    managerId: objectIdSchema.optional(), // if omitted, assigned to creator
    teamId: objectIdSchema.nullable().optional(),
    status: z.enum(ALL_PROJECT_STATUSES).optional(),
    priority: z.enum(ALL_PRIORITIES).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().nullable().optional(),
  }),
});

export const updateProjectSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(1000).optional(),
    teamId: objectIdSchema.nullable().optional(),
    priority: z.enum(ALL_PRIORITIES).optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().nullable().optional(),
  }),
});

export const changeProjectStatusSchema = z.object({
  body: z.object({
    status: z.enum(ALL_PROJECT_STATUSES),
  }),
});

export const assignProjectManagerSchema = z.object({
  body: z.object({
    managerId: objectIdSchema,
  }),
});

export const addProjectMemberSchema = z.object({
  body: z.object({
    userId: objectIdSchema,
    role: z.enum(['MANAGER', 'MEMBER']).optional().default('MEMBER'),
  }),
});

export const projectMemberParamsSchema = z.object({
  params: z.object({
    id: objectIdSchema,
    userId: objectIdSchema,
  }),
});

export const listProjectsQuerySchema = z.object({
  query: searchSchema.merge(paginationSchema).extend({
    status: z.enum(ALL_PROJECT_STATUSES).optional(),
    priority: z.enum(ALL_PRIORITIES).optional(),
    managerId: objectIdSchema.optional(),
    teamId: objectIdSchema.optional(),
  }),
});

