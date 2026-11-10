import { z } from 'zod';
import { objectIdSchema, paginationSchema } from '../../validators/common.js';

export const createCommentSchema = z.object({
  params: z.object({
    taskId: objectIdSchema,
  }),
  body: z.object({
    content: z.string().trim().min(1, 'Comment cannot be empty').max(2000),
  }),
});

export const listCommentsSchema = z.object({
  params: z.object({
    taskId: objectIdSchema,
  }),
  query: paginationSchema,
});

export const updateCommentSchema = z.object({
  params: z.object({
    commentId: objectIdSchema,
  }),
  body: z.object({
    content: z.string().trim().min(1, 'Comment cannot be empty').max(2000),
  }),
});

export const commentIdParamSchema = z.object({
  params: z.object({
    commentId: objectIdSchema,
  }),
});

