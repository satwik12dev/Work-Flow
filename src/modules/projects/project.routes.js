import { Router } from 'express';
import { projectController } from './project.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { orgContext } from '../../middlewares/orgContext.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import {
  createProjectSchema,
  updateProjectSchema,
  changeProjectStatusSchema,
  assignProjectManagerSchema,
  addProjectMemberSchema,
  projectMemberParamsSchema,
  listProjectsQuerySchema,
} from './project.validators.js';
import { idParamSchema } from '../../validators/common.js';
import { ROLES } from '../../constants/roles.js';
import { taskController } from '../tasks/task.controller.js';
import {
  listTasksQuerySchema,
  projectTasksParamSchema,
} from '../tasks/task.validators.js';

const router = Router();

// Middleware: Authentication & Organization Multi-tenant context
router.use(authenticate);
router.use(orgContext());

// ─── Project Collection ───────────────────────────────────────
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  validate(createProjectSchema),
  projectController.create
);

router.get(
  '/',
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  validate(listProjectsQuerySchema),
  projectController.list
);

// ─── Single Project ───────────────────────────────────────────
router.get(
  '/:id',
  validate(idParamSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  projectController.getById
);

router.patch(
  '/:id',
  validate(idParamSchema),
  validate(updateProjectSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  projectController.update
);

router.patch(
  '/:id/status',
  validate(idParamSchema),
  validate(changeProjectStatusSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  projectController.changeStatus
);

router.delete(
  '/:id',
  validate(idParamSchema),
  authorize(ROLES.ADMIN),
  projectController.delete
);

// ─── Project Members ──────────────────────────────────────────
router.post(
  '/:id/members',
  validate(idParamSchema),
  validate(addProjectMemberSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  projectController.addMember
);

router.delete(
  '/:id/members/:userId',
  validate(projectMemberParamsSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  projectController.removeMember
);

// ─── Project Manager ──────────────────────────────────────────
router.patch(
  '/:id/manager',
  validate(idParamSchema),
  validate(assignProjectManagerSchema),
  authorize(ROLES.ADMIN),
  projectController.assignManager
);

// ─── Project Tasks ────────────────────────────────────────────
router.get(
  '/:projectId/tasks',
  validate(projectTasksParamSchema),
  validate(listTasksQuerySchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  taskController.getProjectTasks
);

export default router;

