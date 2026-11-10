import { Router } from 'express';
import { notificationController } from './notification.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { orgContext } from '../../middlewares/orgContext.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { listNotificationsQuerySchema } from './notification.validators.js';
import { idParamSchema } from '../../validators/common.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

router.use(authenticate);
router.use(orgContext());
router.use(authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE));

router.get(
  '/',
  validate(listNotificationsQuerySchema),
  notificationController.list
);

router.get(
  '/unread-count',
  notificationController.unreadCount
);

router.patch(
  '/read-all',
  notificationController.markAllAsRead
);

router.patch(
  '/:id/read',
  validate(idParamSchema),
  notificationController.markAsRead
);

router.delete(
  '/:id',
  validate(idParamSchema),
  notificationController.delete
);

export default router;

