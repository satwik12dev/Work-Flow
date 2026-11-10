import { Router } from 'express';
import { teamController } from './team.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { orgContext } from '../../middlewares/orgContext.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import {
  createTeamSchema,
  updateTeamSchema,
  addTeamMemberSchema,
  assignTeamManagerSchema,
  teamMemberParamsSchema,
  listTeamsQuerySchema,
} from './team.validators.js';
import { idParamSchema } from '../../validators/common.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

// ─── Middleware Chain: Authenticate + Organization Context ────
router.use(authenticate);
router.use(orgContext());

// ─── Team Collection Routes ───────────────────────────────────
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  validate(createTeamSchema),
  teamController.create
);

router.get(
  '/',
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  validate(listTeamsQuerySchema),
  teamController.list
);

// ─── Single Team Routes ───────────────────────────────────────
router.get(
  '/:id',
  validate(idParamSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  teamController.getById
);

router.patch(
  '/:id',
  validate(idParamSchema),
  validate(updateTeamSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  teamController.update
);

router.delete(
  '/:id',
  validate(idParamSchema),
  authorize(ROLES.ADMIN),
  teamController.delete
);

// ─── Team Members ─────────────────────────────────────────────
router.post(
  '/:id/members',
  validate(idParamSchema),
  validate(addTeamMemberSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  teamController.addMember
);

router.delete(
  '/:id/members/:userId',
  validate(teamMemberParamsSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  teamController.removeMember
);

// ─── Team Manager Assignment ──────────────────────────────────
router.patch(
  '/:id/manager',
  validate(idParamSchema),
  validate(assignTeamManagerSchema),
  authorize(ROLES.ADMIN),
  teamController.assignManager
);

// ─── Team Workload ────────────────────────────────────────────
router.get(
  '/:id/workload',
  validate(idParamSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  teamController.getWorkload
);

export default router;

