import { Router } from 'express';
import { analyticsController } from './analytics.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { orgContext } from '../../middlewares/orgContext.js';
import { authorize } from '../../middlewares/authorize.js';
import { validate } from '../../middlewares/validate.js';
import { projectAnalyticsParamSchema } from './analytics.validators.js';
import { ROLES } from '../../constants/roles.js';

const router = Router();

router.use(authenticate);
router.use(orgContext());

router.get(
  '/organization',
  authorize(ROLES.ADMIN),
  analyticsController.getOrganizationDashboard
);

router.get(
  '/manager',
  authorize(ROLES.ADMIN, ROLES.MANAGER),
  analyticsController.getManagerDashboard
);

router.get(
  '/my-dashboard',
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  analyticsController.getMyDashboard
);

router.get(
  '/projects/:projectId',
  validate(projectAnalyticsParamSchema),
  authorize(ROLES.ADMIN, ROLES.MANAGER, ROLES.EMPLOYEE),
  analyticsController.getProjectAnalytics
);

export default router;

