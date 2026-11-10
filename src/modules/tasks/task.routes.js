import { Router } from 'express';
import { taskController } from './task.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { orgContext } from '../../middlewares/orgContext.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import {
  createTaskSchema,
  updateTaskSchema,
  updateTaskStatusSchema,
  assignTaskSchema,
  listTasksQuerySchema,
} from './task.validators.js';
import { idParamSchema } from '../../validators/common.js';
import { ROLES } from '../../constants/roles.js';
import { commentController } from '../comments/comment.controller.js';
import {
  createCommentSchema,
  listCommentsSchema,
} from '../comments/comment.validators.js';
import { attachmentController } from '../attachments/attachment.controller.js';
import { taskAttachmentsParamSchema } from '../attachments/attachment.validators.js';
import { upload } from '../../middlewares/upload.js';

const router = Router();

router.use(authenticate);
router.use(orgContext());

// ─── Task Collection ──────────────────────────────────────────
router.post(
  '/',
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  validate(createTaskSchema),
  taskController.create
);

router.get(
  '/',
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  validate(listTasksQuerySchema),
  taskController.list
);

// ─── Single Task ──────────────────────────────────────────────
router.get(
  '/:id',
  validate(idParamSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  taskController.getById
);

router.patch(
  '/:id',
  validate(idParamSchema),
  validate(updateTaskSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  taskController.update
);

router.patch(
  '/:id/status',
  validate(idParamSchema),
  validate(updateTaskStatusSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  taskController.updateStatus
);

router.patch(
  '/:id/assign',
  validate(idParamSchema),
  validate(assignTaskSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  taskController.assign
);

router.delete(
  '/:id',
  validate(idParamSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  taskController.delete
);

router.get(
  '/:id/activity',
  validate(idParamSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  taskController.getActivity
);

// ─── Task Comments ────────────────────────────────────────────
router.post(
  '/:taskId/comments',
  validate(createCommentSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  commentController.create
);

router.get(
  '/:taskId/comments',
  validate(listCommentsSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  commentController.list
);

// ─── Task Attachments ─────────────────────────────────────────
router.post(
  '/:taskId/attachments',
  validate(taskAttachmentsParamSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  upload.array('files', 5),
  attachmentController.upload
);

router.get(
  '/:taskId/attachments',
  validate(taskAttachmentsParamSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  attachmentController.listByTask
);

export default router;

