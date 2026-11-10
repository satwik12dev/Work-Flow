import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Task } from './task.model.js';
import { Project } from '../projects/project.model.js';
import { ProjectMember } from '../projects/projectMember.model.js';
import { OrganizationMember } from '../organizations/organizationMember.model.js';
import { User } from '../users/user.model.js';
import { ActivityLog } from '../../models/activityLog.model.js';
import { EmailOutbox } from '../../models/emailOutbox.model.js';
import { enqueueEmailJob } from '../../queues/email.queue.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/helpers.js';
import { runInTransaction } from '../../utils/transaction.js';
import { getPaginationParams, createPaginationResponse } from '../../utils/pagination.js';
import { ALLOWED_TASK_TRANSITIONS, TASK_STATUS } from '../../constants/taskStatus.js';
import { ROLES } from '../../constants/roles.js';
import { MEMBER_STATUS } from '../auth/auth.constants.js';
import { logger } from '../../config/logger.js';
import { notificationService } from '../notifications/notification.service.js';
import { NOTIFICATION_TYPE } from '../../constants/notificationTypes.js';

class TaskService {
  /**
   * Helper: Verify project exists in org and check user permission.
   */
  async _verifyProjectAccess(organizationId, projectId, userId, userRole, requireManage = false) {
    const project = await Project.findOne({
      _id: projectId,
      organizationId,
      isDeleted: false,
    });

    if (!project) {
      throw ApiError.notFound('Project not found in this organization.');
    }

    if (requireManage) {
      if (userRole !== ROLES.ADMIN && project.managerId.toString() !== userId.toString()) {
        throw ApiError.forbidden('Only an Admin or the project manager can perform this action.');
      }
    } else if (userRole === ROLES.EMPLOYEE) {
      const isMember = await ProjectMember.findOne({ projectId, userId });
      if (!isMember) {
        throw ApiError.forbidden('You do not have access to tasks in this project.');
      }
    }

    return project;
  }

  /**
   * Helper: Verify target assignee is an active org member and project member.
   */
  async _verifyAssignee(organizationId, projectId, assigneeId) {
    const orgMember = await OrganizationMember.findOne({
      organizationId,
      userId: assigneeId,
      status: MEMBER_STATUS.ACTIVE,
    });
    if (!orgMember) {
      throw ApiError.badRequest('Assignee must be an active member of this organization.');
    }

    const projectMember = await ProjectMember.findOne({
      projectId,
      userId: assigneeId,
    });
    if (!projectMember) {
      throw ApiError.badRequest('Assignee must be added to the project before being assigned tasks.');
    }

    const user = await User.findById(assigneeId).select('name email');
    if (!user) {
      throw ApiError.notFound('Assignee user not found.');
    }
    return user;
  }

  /**
   * Helper: Build EmailOutbox document for task assignment / reassignment.
   */
  _buildAssignmentOutboxEvent({
    organizationId,
    eventType,
    assigneeUser,
    task,
    projectName,
    actorName,
  }) {
    const eventId = uuidv4();
    const isReassignment = eventType === 'TASK_REASSIGNED';

    return new EmailOutbox({
      eventId,
      organizationId,
      eventType,
      recipientEmail: assigneeUser.email,
      recipientName: assigneeUser.name,
      subject: isReassignment
        ? `[WorkFlowX] Task Reassigned to You: ${task.title}`
        : `[WorkFlowX] New Task Assigned: ${task.title}`,
      payload: {
        taskId: task._id.toString(),
        taskTitle: task.title,
        taskDescription: task.description || '',
        projectName,
        priority: task.priority,
        dueDate: task.dueDate ? task.dueDate.toISOString() : null,
        assignedBy: actorName,
        reassignedBy: actorName,
      },
      status: 'QUEUED',
    });
  }

  /**
   * Create a new task (atomically creates Task + ActivityLog + EmailOutbox if assigned).
   */
  async createTask(organizationId, data, creatorUser, userRole) {
    const project = await this._verifyProjectAccess(
      organizationId,
      data.projectId,
      creatorUser._id,
      userRole,
      true
    );

    let assigneeUser = null;
    if (data.assignedTo) {
      assigneeUser = await this._verifyAssignee(organizationId, project._id, data.assignedTo);
    }

    let outboxEvent = null;

    const createdTask = await runInTransaction(async (session) => {
      const taskDoc = new Task({
        title: data.title,
        description: data.description || '',
        organizationId,
        projectId: project._id,
        assignedTo: data.assignedTo || null,
        assignedBy: data.assignedTo ? creatorUser._id : null,
        createdBy: creatorUser._id,
        priority: data.priority || project.priority,
        status: data.status || TASK_STATUS.TODO,
        dueDate: data.dueDate || null,
        estimatedHours: data.estimatedHours || 0,
        tags: data.tags || [],
      });

      const savedTask = await taskDoc.save({ session });

      const activity = new ActivityLog({
        userId: creatorUser._id,
        organizationId,
        action: 'TASK_CREATED',
        entityType: 'TASK',
        entityId: savedTask._id,
        changes: {
          title: savedTask.title,
          assignedTo: savedTask.assignedTo,
          priority: savedTask.priority,
        },
      });
      await activity.save({ session });

      if (assigneeUser) {
        outboxEvent = this._buildAssignmentOutboxEvent({
          organizationId,
          eventType: 'TASK_ASSIGNED',
          assigneeUser,
          task: savedTask,
          projectName: project.name,
          actorName: creatorUser.name,
        });
        await outboxEvent.save({ session });
      }

      return savedTask;
    });

    // Dispatch email job and real-time notification asynchronously after transaction commit
    if (outboxEvent) {
      try {
        await enqueueEmailJob(outboxEvent);
      } catch (err) {
        logger.error(`Failed to enqueue task assignment email for task ${createdTask._id}: ${err.message}`);
      }
    }

    if (assigneeUser) {
      await notificationService.createAndEmit({
        recipientId: assigneeUser._id,
        organizationId,
        type: NOTIFICATION_TYPE.TASK_ASSIGNED,
        title: 'New Task Assigned',
        message: `${creatorUser.name} assigned you to "${createdTask.title}".`,
        metadata: { taskId: createdTask._id, projectId: project._id },
      });
    }

    logger.info(`Task "${createdTask.title}" (${createdTask._id}) created in project ${project._id}`);
    return createdTask;
  }

  /**
   * List tasks with filtering, search, sorting, pagination, and RBAC scoping.
   */
  async listTasks(organizationId, query, userId, userRole) {
    const { page, limit, skip, sort } = getPaginationParams(query);
    const filter = { organizationId, isDeleted: false };

    if (query.projectId) filter.projectId = query.projectId;
    if (query.assignedTo) filter.assignedTo = query.assignedTo;
    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;

    if (query.overdue === 'true') {
      filter.dueDate = { $lt: new Date() };
      filter.status = { $ne: TASK_STATUS.DONE };
    } else if (query.overdue === 'false') {
      filter.$or = [{ dueDate: null }, { dueDate: { $gte: new Date() } }, { status: TASK_STATUS.DONE }];
    }

    if (query.search) {
      const searchRegex = new RegExp(escapeRegex(query.search.trim()), 'i');
      const searchOr = [{ title: searchRegex }, { description: searchRegex }, { tags: searchRegex }];
      if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, { $or: searchOr }];
        delete filter.$or;
      } else {
        filter.$or = searchOr;
      }
    }

    // Role scoping for non-admins
    if (userRole === ROLES.EMPLOYEE) {
      const memberships = await ProjectMember.find({ organizationId, userId }).select('projectId');
      const projectIds = memberships.map((m) => m.projectId);
      const accessFilter = { $or: [{ assignedTo: userId }, { projectId: { $in: projectIds } }] };

      if (filter.$and) {
        filter.$and.push(accessFilter);
      } else if (filter.$or) {
        filter.$and = [{ $or: filter.$or }, accessFilter];
        delete filter.$or;
      } else {
        Object.assign(filter, accessFilter);
      }
    }

    const [tasks, totalDocs] = await Promise.all([
      Task.find(filter)
        .populate('projectId', 'name status')
        .populate('assignedTo', 'name email')
        .populate('assignedBy', 'name email')
        .populate('createdBy', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean({ virtuals: true }),
      Task.countDocuments(filter),
    ]);

    return {
      tasks,
      pagination: createPaginationResponse(totalDocs, page, limit),
    };
  }

  /**
   * Get tasks for a specific project.
   */
  async getProjectTasks(organizationId, projectId, query, userId, userRole) {
    await this._verifyProjectAccess(organizationId, projectId, userId, userRole, false);
    return this.listTasks(organizationId, { ...query, projectId }, userId, userRole);
  }

  /**
   * Get tasks assigned to the current authenticated user.
   */
  async getMyTasks(organizationId, query, userId, userRole) {
    return this.listTasks(
      organizationId,
      { ...query, assignedTo: userId.toString() },
      userId,
      userRole
    );
  }

  /**
   * Get single task details.
   */
  async getTaskById(organizationId, taskId, userId, userRole) {
    const task = await Task.findOne({
      _id: taskId,
      organizationId,
      isDeleted: false,
    })
      .populate('projectId', 'name status managerId')
      .populate('assignedTo', 'name email')
      .populate('assignedBy', 'name email')
      .populate('createdBy', 'name email');

    if (!task) {
      throw ApiError.notFound('Task not found.');
    }

    if (userRole === ROLES.EMPLOYEE) {
      const isAssigned = task.assignedTo && task.assignedTo._id.toString() === userId.toString();
      if (!isAssigned) {
        const isMember = await ProjectMember.findOne({
          projectId: task.projectId._id,
          userId,
        });
        if (!isMember) {
          throw ApiError.forbidden('You do not have permission to view this task.');
        }
      }
    }

    return task;
  }

  /**
   * Update general task fields (never sends duplicate assignment emails).
   */
  async updateTask(organizationId, taskId, updates, actorUser, userRole) {
    const task = await Task.findOne({
      _id: taskId,
      organizationId,
      isDeleted: false,
    });

    if (!task) {
      throw ApiError.notFound('Task not found.');
    }

    await this._verifyProjectAccess(organizationId, task.projectId, actorUser._id, userRole, true);

    const changes = {};
    const updatableFields = [
      'title',
      'description',
      'priority',
      'dueDate',
      'estimatedHours',
      'actualHours',
      'tags',
    ];

    for (const field of updatableFields) {
      if (updates[field] !== undefined) {
        changes[field] = { from: task[field], to: updates[field] };
        task[field] = updates[field];
      }
    }

    await task.save();

    if (Object.keys(changes).length > 0) {
      await ActivityLog.create({
        userId: actorUser._id,
        organizationId,
        action: 'TASK_UPDATED',
        entityType: 'TASK',
        entityId: task._id,
        changes,
      });

      // Notify assignee if deadline changed
      if (changes.dueDate && task.assignedTo && task.assignedTo.toString() !== actorUser._id.toString()) {
        await notificationService.createAndEmit({
          recipientId: task.assignedTo,
          organizationId,
          type: NOTIFICATION_TYPE.DEADLINE_CHANGED,
          title: 'Task Deadline Updated',
          message: `The deadline for "${task.title}" was updated by ${actorUser.name}.`,
          metadata: { taskId: task._id, projectId: task.projectId, dueDate: task.dueDate },
        });
      }
    }

    return task;
  }

  /**
   * Update task status with transition validation and activity logging.
   */
  async updateTaskStatus(organizationId, taskId, newStatus, actorUser, userRole) {
    const task = await Task.findOne({
      _id: taskId,
      organizationId,
      isDeleted: false,
    });

    if (!task) {
      throw ApiError.notFound('Task not found.');
    }

    // Access check: Employee can only update status if assigned to them
    if (userRole === ROLES.EMPLOYEE) {
      if (!task.assignedTo || task.assignedTo.toString() !== actorUser._id.toString()) {
        throw ApiError.forbidden('Employees can only update the status of tasks assigned to them.');
      }
    } else if (userRole === ROLES.MANAGER) {
      await this._verifyProjectAccess(organizationId, task.projectId, actorUser._id, userRole, true);
    }

    const currentStatus = task.status;
    if (currentStatus === newStatus) {
      return task;
    }

    const allowedNext = ALLOWED_TASK_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(newStatus)) {
      throw ApiError.badRequest(
        `Cannot transition task from [${currentStatus}] to [${newStatus}]. Allowed: [${allowedNext.join(', ')}]`
      );
    }

    task.status = newStatus;
    task.completedAt = newStatus === TASK_STATUS.DONE ? new Date() : null;
    await task.save();

    await ActivityLog.create({
      userId: actorUser._id,
      organizationId,
      action: 'TASK_STATUS_CHANGED',
      entityType: 'TASK',
      entityId: task._id,
      changes: { from: currentStatus, to: newStatus },
    });

    logger.info(`Task ${taskId} status changed: ${currentStatus} -> ${newStatus}`);
    return task;
  }

  /**
   * Assign or reassign a task to an employee.
   * Atomically updates task, logs activity, creates EmailOutbox event, and dispatches BullMQ job.
   */
  async assignTask(organizationId, taskId, newAssigneeId, actorUser, userRole) {
    const task = await Task.findOne({
      _id: taskId,
      organizationId,
      isDeleted: false,
    });

    if (!task) {
      throw ApiError.notFound('Task not found.');
    }

    const project = await this._verifyProjectAccess(
      organizationId,
      task.projectId,
      actorUser._id,
      userRole,
      true
    );

    const previousAssigneeId = task.assignedTo ? task.assignedTo.toString() : null;
    const incomingAssigneeId = newAssigneeId ? newAssigneeId.toString() : null;

    // Prevent duplicate emails if assignee hasn't changed
    if (previousAssigneeId === incomingAssigneeId) {
      return task;
    }

    let assigneeUser = null;
    if (incomingAssigneeId) {
      assigneeUser = await this._verifyAssignee(organizationId, project._id, incomingAssigneeId);
    }

    const isReassignment = Boolean(previousAssigneeId && incomingAssigneeId);
    const actionType = isReassignment ? 'TASK_REASSIGNED' : 'TASK_ASSIGNED';

    let outboxEvent = null;

    await runInTransaction(async (session) => {
      task.assignedTo = incomingAssigneeId;
      task.assignedBy = incomingAssigneeId ? actorUser._id : null;
      await task.save({ session });

      const activity = new ActivityLog({
        userId: actorUser._id,
        organizationId,
        action: actionType,
        entityType: 'TASK',
        entityId: task._id,
        changes: { from: previousAssigneeId, to: incomingAssigneeId },
      });
      await activity.save({ session });

      if (assigneeUser) {
        outboxEvent = this._buildAssignmentOutboxEvent({
          organizationId,
          eventType: actionType,
          assigneeUser,
          task,
          projectName: project.name,
          actorName: actorUser.name,
        });
        await outboxEvent.save({ session });
      }
    });

    if (outboxEvent) {
      try {
        await enqueueEmailJob(outboxEvent);
      } catch (err) {
        logger.error(`Failed to enqueue ${actionType} email for task ${task._id}: ${err.message}`);
      }
    }

    if (assigneeUser) {
      await notificationService.createAndEmit({
        recipientId: assigneeUser._id,
        organizationId,
        type: isReassignment ? NOTIFICATION_TYPE.TASK_REASSIGNED : NOTIFICATION_TYPE.TASK_ASSIGNED,
        title: isReassignment ? 'Task Reassigned to You' : 'New Task Assigned',
        message: `${actorUser.name} assigned you to "${task.title}".`,
        metadata: { taskId: task._id, projectId: project._id },
      });
    }

    logger.info(`Task ${task._id} ${actionType} -> ${incomingAssigneeId || 'Unassigned'}`);
    return task;
  }

  /**
   * Soft-delete a task.
   */
  async deleteTask(organizationId, taskId, actorUser, userRole) {
    const task = await Task.findOne({
      _id: taskId,
      organizationId,
      isDeleted: false,
    });

    if (!task) {
      throw ApiError.notFound('Task not found.');
    }

    await this._verifyProjectAccess(organizationId, task.projectId, actorUser._id, userRole, true);

    task.isDeleted = true;
    task.deletedAt = new Date();
    await task.save();

    await ActivityLog.create({
      userId: actorUser._id,
      organizationId,
      action: 'TASK_DELETED',
      entityType: 'TASK',
      entityId: task._id,
      changes: { title: task.title },
    });

    return { message: 'Task deleted successfully.' };
  }

  /**
   * Get activity history for a task.
   */
  async getTaskActivity(organizationId, taskId, userId, userRole) {
    await this.getTaskById(organizationId, taskId, userId, userRole);

    return ActivityLog.find({
      organizationId,
      entityType: 'TASK',
      entityId: taskId,
    })
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .lean();
  }
}

export const taskService = new TaskService();

