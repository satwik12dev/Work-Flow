import { Attachment } from './attachment.model.js';
import { Task } from '../tasks/task.model.js';
import { Project } from '../projects/project.model.js';
import { ProjectMember } from '../projects/projectMember.model.js';
import { ActivityLog } from '../../models/activityLog.model.js';
import { fileService } from '../../services/file.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { ROLES } from '../../constants/roles.js';
import { logger } from '../../config/logger.js';

class AttachmentService {
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
          throw ApiError.forbidden('You do not have permission to access attachments on this task.');
        }
      }
    }

    return { task, project };
  }

  /**
   * Upload one or more files to Cloudinary and save metadata in MongoDB.
   */
  async uploadAttachments(organizationId, taskId, files, user, userRole) {
    if (!files || files.length === 0) {
      throw ApiError.badRequest('At least one file is required for upload.');
    }

    const { task } = await this._verifyTaskAccess(organizationId, taskId, user._id, userRole);

    const folder = `workflowx/${organizationId}/tasks/${taskId}`;
    const createdAttachments = [];

    for (const file of files) {
      const uploaded = await fileService.uploadBuffer(file, folder);

      const attachment = await Attachment.create({
        taskId: task._id,
        organizationId,
        uploadedBy: user._id,
        fileName: file.originalname,
        fileUrl: uploaded.fileUrl,
        publicId: uploaded.publicId,
        resourceType: uploaded.resourceType,
        mimeType: file.mimetype,
        fileSize: file.size,
      });

      createdAttachments.push(attachment);
    }

    // Link attachments to task document
    const attachmentIds = createdAttachments.map((a) => a._id);
    await Task.updateOne(
      { _id: task._id },
      { $push: { attachments: { $each: attachmentIds } } }
    );

    await ActivityLog.create({
      userId: user._id,
      organizationId,
      action: 'ATTACHMENT_UPLOADED',
      entityType: 'TASK',
      entityId: task._id,
      changes: {
        count: createdAttachments.length,
        fileNames: createdAttachments.map((a) => a.fileName),
      },
    });

    logger.info(`${createdAttachments.length} attachment(s) uploaded for task ${taskId}`);
    return createdAttachments;
  }

  /**
   * List attachments for a task.
   */
  async listTaskAttachments(organizationId, taskId, userId, userRole) {
    await this._verifyTaskAccess(organizationId, taskId, userId, userRole);

    return Attachment.find({
      organizationId,
      taskId,
    })
      .populate('uploadedBy', 'name email')
      .sort({ createdAt: -1 })
      .lean();
  }

  /**
   * Get single attachment metadata (with authorization check).
   */
  async getAttachmentById(organizationId, attachmentId, userId, userRole) {
    const attachment = await Attachment.findOne({
      _id: attachmentId,
      organizationId,
    }).populate('uploadedBy', 'name email');

    if (!attachment) {
      throw ApiError.notFound('Attachment not found.');
    }

    await this._verifyTaskAccess(organizationId, attachment.taskId, userId, userRole);
    return attachment;
  }

  /**
   * Delete attachment from Cloudinary, MongoDB, and task references.
   */
  async deleteAttachment(organizationId, attachmentId, userId, userRole) {
    const attachment = await Attachment.findOne({
      _id: attachmentId,
      organizationId,
    });

    if (!attachment) {
      throw ApiError.notFound('Attachment not found.');
    }

    const isUploader = attachment.uploadedBy.toString() === userId.toString();

    if (!isUploader && userRole !== ROLES.ADMIN) {
      const task = await Task.findById(attachment.taskId);
      const project = task ? await Project.findById(task.projectId) : null;
      const isProjectManager =
        userRole === ROLES.MANAGER &&
        project &&
        project.managerId.toString() === userId.toString();

      if (!isProjectManager) {
        throw ApiError.forbidden('You do not have permission to delete this attachment.');
      }
    }

    // Delete from Cloudinary
    await fileService.deleteFile(attachment.publicId, attachment.resourceType);

    // Remove reference from Task and delete Attachment record
    await Task.updateOne(
      { _id: attachment.taskId },
      { $pull: { attachments: attachment._id } }
    );
    await Attachment.deleteOne({ _id: attachment._id });

    await ActivityLog.create({
      userId,
      organizationId,
      action: 'ATTACHMENT_DELETED',
      entityType: 'TASK',
      entityId: attachment.taskId,
      changes: { fileName: attachment.fileName },
    });

    logger.info(`Attachment ${attachmentId} deleted by user ${userId}`);
    return { message: 'Attachment deleted successfully.' };
  }
}

export const attachmentService = new AttachmentService();

