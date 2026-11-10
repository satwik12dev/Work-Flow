import { z } from 'zod';
import { objectIdSchema } from '../../validators/common.js';

export const projectAnalyticsParamSchema = z.object({
  params: z.object({
    projectId: objectIdSchema,
  }),
});

