import { z } from 'zod';
import { objectIdSchema, paginationSchema, searchSchema } from '../../validators/common.js';
import { ALL_TASK_STATUSES } from '../../constants/taskStatus.js';
import { ALL_PRIORITIES } from '../../constants/priorities.js';

export const createTaskSchema = z.object({
  body: z.object({
    title: z.string().trim().min(2, 'Task title must be at least 2 characters').max(200),
    description: z.string().trim().max(2000).optional(),
    projectId: objectIdSchema,
    assignedTo: objectIdSchema.nullable().optional(),
    priority: z.enum(ALL_PRIORITIES).optional(),
    status: z.enum(ALL_TASK_STATUSES).optional(),
    dueDate: z.coerce.date().nullable().optional(),
    estimatedHours: z.coerce.number().min(0).optional(),
    tags: z.array(z.string().trim().max(50)).max(20).optional(),
  }),
});

export const updateTaskSchema = z.object({
  body: z.object({
    title: z.string().trim().min(2).max(200).optional(),
    description: z.string().trim().max(2000).optional(),
    priority: z.enum(ALL_PRIORITIES).optional(),
    dueDate: z.coerce.date().nullable().optional(),
    estimatedHours: z.coerce.number().min(0).optional(),
    actualHours: z.coerce.number().min(0).optional(),
    tags: z.array(z.string().trim().max(50)).max(20).optional(),
  }),
});

export const updateTaskStatusSchema = z.object({
  body: z.object({
    status: z.enum(ALL_TASK_STATUSES),
  }),
});

export const assignTaskSchema = z.object({
  body: z.object({
    assignedTo: objectIdSchema.nullable(),
  }),
});

export const listTasksQuerySchema = z.object({
  query: searchSchema.merge(paginationSchema).extend({
    projectId: objectIdSchema.optional(),
    assignedTo: objectIdSchema.optional(),
    status: z.enum(ALL_TASK_STATUSES).optional(),
    priority: z.enum(ALL_PRIORITIES).optional(),
    overdue: z.enum(['true', 'false']).optional(),
  }),
});

export const projectTasksParamSchema = z.object({
  params: z.object({
    projectId: objectIdSchema,
  }),
});

