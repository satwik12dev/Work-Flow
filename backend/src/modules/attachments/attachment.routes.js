import { Router } from 'express';
import { attachmentController } from './attachment.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { orgContext } from '../../middlewares/orgContext.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { attachmentIdParamSchema } from './attachment.validators.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

router.use(authenticate);
router.use(orgContext());

router.get(
  '/:attachmentId',
  validate(attachmentIdParamSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  attachmentController.getById
);

router.delete(
  '/:attachmentId',
  validate(attachmentIdParamSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  attachmentController.delete
);

export default router;

