import { TaskComment } from './comment.model.js';
import { Task } from '../tasks/task.model.js';
import { Project } from '../projects/project.model.js';
import { ProjectMember } from '../projects/projectMember.model.js';
import { ActivityLog } from '../../models/activityLog.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { getPaginationParams, createPaginationResponse } from '../../utils/pagination.js';
import { ROLES } from '../../constants/roles.js';
import { notificationService } from '../notifications/notification.service.js';
import { NOTIFICATION_TYPE } from '../../constants/notificationTypes.js';

class CommentService {
  /**
   * Helper: Verify task exists in organization and user has access to its project.
   */
  async _verifyTaskAccess(organizationId, taskId, userId, userRole) {
    const task = await Task.findOne({
      _id: taskId,
      organizationId,
      isDeleted: false,
    });

    if (!task) {
      throw ApiError.notFound('Task not found in this organization.');
    }

    const project = await Project.findOne({
      _id: task.projectId,
      organizationId,
      isDeleted: false,
    });

    if (!project) {
      throw ApiError.notFound('Associated project not found.');
    }

    if (userRole === ROLES.EMPLOYEE) {
      const isAssigned = task.assignedTo && task.assignedTo.toString() === userId.toString();
      if (!isAssigned) {
        const isMember = await ProjectMember.findOne({
          projectId: project._id,
          userId,
        });
        if (!isMember) {
          throw ApiError.forbidden('You do not have access to comments on this task.');
        }
      }
    }

    return { task, project };
  }

  /**
   * Add a comment to a task.
   */
  async addComment(organizationId, taskId, content, user, userRole) {
    const { task } = await this._verifyTaskAccess(organizationId, taskId, user._id, userRole);

    const comment = await TaskComment.create({
      taskId: task._id,
      organizationId,
      authorId: user._id,
      content,
    });

    await ActivityLog.create({
      userId: user._id,
      organizationId,
      action: 'COMMENT_ADDED',
      entityType: 'TASK',
      entityId: task._id,
      changes: { commentId: comment._id },
    });

    // Notify task assignee (if different from commenter)
    if (task.assignedTo && task.assignedTo.toString() !== user._id.toString()) {
      await notificationService.createAndEmit({
        recipientId: task.assignedTo,
        organizationId,
        type: NOTIFICATION_TYPE.TASK_COMMENT,
        title: 'New Comment on Task',
        message: `${user.name} commented on "${task.title}".`,
        metadata: { taskId: task._id, commentId: comment._id, projectId: task.projectId },
      });
    }

    await comment.populate('authorId', 'name email');
    return comment;
  }

  /**
   * List comments for a task (chronological order by default).
   */
  async listComments(organizationId, taskId, query, userId, userRole) {
    await this._verifyTaskAccess(organizationId, taskId, userId, userRole);

    const { page, limit, skip } = getPaginationParams(query);
    const sortOrder = query.sortOrder === 'desc' ? -1 : 1;

    const filter = {
      organizationId,
      taskId,
      isDeleted: false,
    };

    const [comments, totalDocs] = await Promise.all([
      TaskComment.find(filter)
        .populate('authorId', 'name email')
        .sort({ createdAt: sortOrder })
        .skip(skip)
        .limit(limit)
        .lean(),
      TaskComment.countDocuments(filter),
    ]);

    return {
      comments,
      pagination: createPaginationResponse(totalDocs, page, limit),
    };
  }

  /**
   * Edit own comment.
   */
  async updateComment(organizationId, commentId, content, userId) {
    const comment = await TaskComment.findOne({
      _id: commentId,
      organizationId,
      isDeleted: false,
    });

    if (!comment) {
      throw ApiError.notFound('Comment not found.');
    }

    if (comment.authorId.toString() !== userId.toString()) {
      throw ApiError.forbidden('You can only edit your own comments.');
    }

    comment.content = content;
    comment.isEdited = true;
    comment.editedAt = new Date();
    await comment.save();

    await comment.populate('authorId', 'name email');
    return comment;
  }

  /**
   * Delete comment (author or authorized Manager / Admin moderation).
   */
  async deleteComment(organizationId, commentId, userId, userRole) {
    const comment = await TaskComment.findOne({
      _id: commentId,
      organizationId,
      isDeleted: false,
    });

    if (!comment) {
      throw ApiError.notFound('Comment not found.');
    }

    const isAuthor = comment.authorId.toString() === userId.toString();

    if (!isAuthor && userRole !== ROLES.ADMIN) {
      // Check if user is the manager of the task's project
      const task = await Task.findById(comment.taskId);
      const project = task ? await Project.findById(task.projectId) : null;
      const isProjectManager =
        userRole === ROLES.MANAGER &&
        project &&
        project.managerId.toString() === userId.toString();

      if (!isProjectManager) {
        throw ApiError.forbidden('You do not have permission to delete this comment.');
      }
    }

    comment.isDeleted = true;
    comment.deletedAt = new Date();
    await comment.save();

    return { message: 'Comment deleted successfully.' };
  }
}

export const commentService = new CommentService();

