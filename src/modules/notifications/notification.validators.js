import { z } from 'zod';
import { paginationSchema } from '../../validators/common.js';

export const listNotificationsQuerySchema = z.object({
  query: paginationSchema.extend({
    isRead: z.enum(['true', 'false']).optional(),
  }),
});

