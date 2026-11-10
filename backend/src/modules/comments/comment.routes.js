import { Router } from 'express';
import { commentController } from './comment.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { orgContext } from '../../middlewares/orgContext.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { updateCommentSchema, commentIdParamSchema } from './comment.validators.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

router.use(authenticate);
router.use(orgContext());

router.patch(
  '/:commentId',
  validate(updateCommentSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  commentController.update
);

router.delete(
  '/:commentId',
  validate(commentIdParamSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  commentController.delete
);

export default router;

