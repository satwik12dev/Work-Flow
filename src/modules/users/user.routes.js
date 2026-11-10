import { Router } from 'express';
import { userController } from './user.controller.js';
import { authenticate } from '../../middlewares/authenticate.js';
import { orgContext } from '../../middlewares/orgContext.js';
import { validate } from '../../middlewares/validate.js';
import { updateProfileSchema, searchUsersSchema } from './user.validators.js';
import { taskController } from '../tasks/task.controller.js';
import { listTasksQuerySchema } from '../tasks/task.validators.js';

const router = Router();

router.use(authenticate);

router.get('/profile', userController.getProfile);
router.patch('/profile', validate(updateProfileSchema), userController.updateProfile);
router.get('/me/tasks', orgContext(), validate(listTasksQuerySchema), taskController.getMyTasks);
router.get('/', validate(searchUsersSchema), userController.searchUsers);

export default router;

