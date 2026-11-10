import { z } from 'zod';
import { emailSchema, objectIdSchema, paginationSchema, searchSchema } from '../../validators/common.js';
import { ALL_ROLES } from '../../constants/roles.js';

const roleEnum = z.enum(['ADMIN', 'MANAGER', 'EMPLOYEE']);

export const createOrganizationSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2, 'Name must be at least 2 characters').max(100),
    description: z.string().trim().max(500).optional(),
    settings: z
      .object({
        allowEmployeeInvite: z.boolean().optional(),
        defaultTaskPriority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
      })
      .optional(),
  }),
});

export const updateOrganizationSchema = z.object({
  body: z.object({
    name: z.string().trim().min(2).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    settings: z
      .object({
        allowEmployeeInvite: z.boolean().optional(),
        defaultTaskPriority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
      })
      .optional(),
  }),
});

export const inviteMemberSchema = z.object({
  body: z.object({
    email: emailSchema,
    role: roleEnum.default('EMPLOYEE'),
  }),
});

export const addOrgMemberSchema = z.object({
  body: z
    .object({
      userId: objectIdSchema.optional(),
      email: emailSchema.optional(),
      role: roleEnum.default('EMPLOYEE'),
    })
    .refine((data) => Boolean(data.userId || data.email), {
      message: 'Either userId or email is required',
    }),
});

export const updateMemberRoleSchema = z.object({
  body: z.object({
    role: roleEnum,
  }),
  params: z.object({
    memberId: objectIdSchema,
  }),
});

export const memberIdParamSchema = z.object({
  params: z.object({
    memberId: objectIdSchema,
  }),
});

export const tokenParamSchema = z.object({
  params: z.object({
    token: z.string().min(1, 'Invitation token is required'),
  }),
});

export const listMembersQuerySchema = z.object({
  query: searchSchema.merge(paginationSchema).extend({
    role: roleEnum.optional(),
  }),
});

