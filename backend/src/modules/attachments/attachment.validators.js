import { z } from 'zod';
import { objectIdSchema } from '../../validators/common.js';

export const taskAttachmentsParamSchema = z.object({
  params: z.object({
    taskId: objectIdSchema,
  }),
});

export const attachmentIdParamSchema = z.object({
  params: z.object({
    attachmentId: objectIdSchema,
  }),
});

