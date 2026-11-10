import { Router } from 'express';
import { organizationController } from './organization.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { orgContext } from '../../middlewares/orgContext.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import {
  createOrganizationSchema,
  updateOrganizationSchema,
  inviteMemberSchema,
  addOrgMemberSchema,
  updateMemberRoleSchema,
  memberIdParamSchema,
  tokenParamSchema,
  listMembersQuerySchema,
} from './organization.validators.js';
import { idParamSchema } from '../../validators/common.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// All organization routes require authenticated user
router.use(authenticate);

// ─── Invitations Response Endpoints ───────────────────────────
router.post(
  '/invitations/:token/accept',
  validate(tokenParamSchema),
  organizationController.acceptInvitation
);

router.post(
  '/invitations/:token/reject',
  validate(tokenParamSchema),
  organizationController.rejectInvitation
);

// ─── Organization Collection Endpoints ────────────────────────
router.post(
  '/',
  validate(createOrganizationSchema),
  organizationController.create
);

router.get(
  '/',
  organizationController.getMyOrganizations
);

// ─── Single Organization Endpoints (Scoped to Org) ────────────
router.get(
  '/:id',
  validate(idParamSchema),
  orgContext(),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  organizationController.getById
);

router.patch(
  '/:id',
  validate(idParamSchema),
  validate(updateOrganizationSchema),
  orgContext(),
  authorize(ROLES.ADMIN),
  organizationController.update
);

router.delete(
  '/:id',
  validate(idParamSchema),
  orgContext(),
  authorize(ROLES.ADMIN),
  organizationController.delete
);

// ─── Member Invitations ───────────────────────────────────────
router.post(
  '/:id/invitations',
  validate(idParamSchema),
  validate(inviteMemberSchema),
  orgContext(),
  authorize(ROLES.ADMIN),
  organizationController.inviteMember
);

router.get(
  '/:id/invitations',
  validate(idParamSchema),
  orgContext(),
  authorize(ROLES.ADMIN),
  organizationController.listInvitations
);

// ─── Organization Members ─────────────────────────────────────
router.post(
  '/:id/members',
  validate(idParamSchema),
  validate(addOrgMemberSchema),
  orgContext(),
  authorize(ROLES.ADMIN),
  organizationController.addMember
);

router.get(
  '/:id/members',
  validate(idParamSchema),
  validate(listMembersQuerySchema),
  orgContext(),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  organizationController.listMembers
);

router.patch(
  '/:id/members/:memberId/role',
  validate(idParamSchema),
  validate(updateMemberRoleSchema),
  orgContext(),
  authorize(ROLES.ADMIN),
  organizationController.updateMemberRole
);

router.delete(
  '/:id/members/:memberId',
  validate(idParamSchema),
  validate(memberIdParamSchema),
  orgContext(),
  authorize(ROLES.ADMIN),
  organizationController.removeMember
);

export default router;

