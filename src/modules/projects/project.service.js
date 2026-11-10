import mongoose from 'mongoose';
import { Project } from './project.model.js';
import { ProjectMember } from './projectMember.model.js';
import { Team } from '../teams/team.model.js';
import { OrganizationMember } from '../organizations/organizationMember.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/helpers.js';
import { getPaginationParams, createPaginationResponse } from '../../utils/pagination.js';
import { ALLOWED_PROJECT_TRANSITIONS } from '../../constants/projectStatus.js';
import { ROLES } from '../../constants/roles.js';
import { MEMBER_STATUS } from '../auth/auth.constants.js';
import { logger } from '../../config/logger.js';
import { notificationService } from '../notifications/notification.service.js';
import { NOTIFICATION_TYPE } from '../../constants/notificationTypes.js';

class ProjectService {
  /**
   * Helper: Ensure target user is an active organization member.
   */
  async _verifyOrgMembership(organizationId, userId) {
    const member = await OrganizationMember.findOne({
      organizationId,
      userId,
      status: MEMBER_STATUS.ACTIVE,
    });
    if (!member) {
      throw ApiError.badRequest('User must be an active member of this organization.');
    }
    return member;
  }

  /**
   * Calculate project completion percentage based on task statuses.
   */
  async calculateCompletionPercentage(organizationId, projectId) {
    const TaskModel = mongoose.models.Task;
    if (!TaskModel) return 0;

    const stats = await TaskModel.aggregate([
      {
        $match: {
          organizationId: new mongoose.Types.ObjectId(organizationId),
          projectId: new mongoose.Types.ObjectId(projectId),
          isDeleted: false,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          completed: {
            $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] },
          },
        },
      },
    ]);

    if (!stats.length || stats[0].total === 0) return 0;
    return Math.round((stats[0].completed / stats[0].total) * 100);
  }

  /**
   * Create a new project.
   */
  async createProject(organizationId, data, creatorId) {
    const managerId = data.managerId || creatorId;

    // 1. Verify manager is active org member
    await this._verifyOrgMembership(organizationId, managerId);

    // 2. If team assigned, verify team belongs to org
    if (data.teamId) {
      const team = await Team.findOne({
        _id: data.teamId,
        organizationId,
        isDeleted: false,
      });
      if (!team) {
        throw ApiError.notFound('Assigned team not found in this organization.');
      }
    }

    const project = await Project.create({
      ...data,
      organizationId,
      managerId,
      createdBy: creatorId,
    });

    // 3. Register creator and manager as initial project members
    const membersToUpsert = [
      { userId: managerId, role: 'MANAGER' },
      { userId: creatorId, role: managerId.toString() === creatorId.toString() ? 'MANAGER' : 'MEMBER' },
    ];

    for (const m of membersToUpsert) {
      await ProjectMember.updateOne(
        { projectId: project._id, userId: m.userId },
        { $setOnInsert: { organizationId, role: m.role, addedAt: new Date() } },
        { upsert: true }
      );
    }

    logger.info(`Project "${project.name}" created in org ${organizationId}`);
    return project;
  }

  /**
   * List projects scoped by organization and user's role.
   */
  async listProjects(organizationId, query, userId, userRole) {
    const { page, limit, skip, sort } = getPaginationParams(query);
    const filter = { organizationId, isDeleted: false };

    if (query.status) filter.status = query.status;
    if (query.priority) filter.priority = query.priority;
    if (query.managerId) filter.managerId = query.managerId;
    if (query.teamId) filter.teamId = query.teamId;

    if (query.search) {
      const searchRegex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [{ name: searchRegex }, { description: searchRegex }];
    }

    // Role-based scoping for non-admins
    if (userRole === ROLES.EMPLOYEE) {
      const userProjectMemberships = await ProjectMember.find({
        organizationId,
        userId,
      }).select('projectId');
      const projectIds = userProjectMemberships.map((m) => m.projectId);
      filter._id = { $in: projectIds };
    } else if (userRole === ROLES.MANAGER) {
      const userProjectMemberships = await ProjectMember.find({
        organizationId,
        userId,
      }).select('projectId');
      const memberProjectIds = userProjectMemberships.map((m) => m.projectId);
      filter.$or = [
        ...(filter.$or || []),
        { managerId: userId },
        { _id: { $in: memberProjectIds } },
      ];
    }

    const [projects, totalDocs] = await Promise.all([
      Project.find(filter)
        .populate('managerId', 'name email')
        .populate('teamId', 'name')
        .populate('createdBy', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Project.countDocuments(filter),
    ]);

    // Attach completion percentage to each project
    const projectsWithProgress = await Promise.all(
      projects.map(async (proj) => {
        const completionPercentage = await this.calculateCompletionPercentage(
          organizationId,
          proj._id
        );
        return {
          ...proj,
          completionPercentage,
        };
      })
    );

    return {
      projects: projectsWithProgress,
      pagination: createPaginationResponse(totalDocs, page, limit),
    };
  }

  /**
   * Get single project details with completion and member roster.
   */
  async getProjectById(organizationId, projectId, userId, userRole) {
    const project = await Project.findOne({
      _id: projectId,
      organizationId,
      isDeleted: false,
    })
      .populate('managerId', 'name email')
      .populate('teamId', 'name')
      .populate('createdBy', 'name email');

    if (!project) {
      throw ApiError.notFound('Project not found.');
    }

    // Access check: Employees must be members of the project
    if (userRole === ROLES.EMPLOYEE) {
      const isMember = await ProjectMember.findOne({ projectId, userId });
      if (!isMember) {
        throw ApiError.forbidden('You do not have permission to view this project.');
      }
    }

    const [members, completionPercentage] = await Promise.all([
      ProjectMember.find({ projectId }).populate('userId', 'name email lastLoginAt').lean(),
      this.calculateCompletionPercentage(organizationId, projectId),
    ]);

    return {
      ...project.toJSON(),
      completionPercentage,
      members: members.map((m) => ({
        memberId: m._id,
        user: m.userId,
        role: m.role,
        addedAt: m.addedAt,
      })),
    };
  }

  /**
   * Update project details.
   */
  async updateProject(organizationId, projectId, updates, userId, userRole) {
    const project = await Project.findOne({
      _id: projectId,
      organizationId,
      isDeleted: false,
    });

    if (!project) {
      throw ApiError.notFound('Project not found.');
    }

    // Permission check: ADMIN or project manager
    if (userRole !== ROLES.ADMIN && project.managerId.toString() !== userId.toString()) {
      throw ApiError.forbidden('Only an Admin or the project manager can update this project.');
    }

    if (updates.name) project.name = updates.name.trim();
    if (updates.description !== undefined) project.description = updates.description;
    if (updates.priority) project.priority = updates.priority;
    if (updates.startDate) project.startDate = updates.startDate;
    if (updates.endDate !== undefined) project.endDate = updates.endDate;

    if (updates.teamId !== undefined) {
      if (updates.teamId) {
        const team = await Team.findOne({
          _id: updates.teamId,
          organizationId,
          isDeleted: false,
        });
        if (!team) throw ApiError.notFound('Team not found in this organization.');
      }
      project.teamId = updates.teamId;
    }

    await project.save();
    return project;
  }

  /**
   * Change project status with transition validation.
   */
  async changeProjectStatus(organizationId, projectId, newStatus, userId, userRole) {
    const project = await Project.findOne({
      _id: projectId,
      organizationId,
      isDeleted: false,
    });

    if (!project) {
      throw ApiError.notFound('Project not found.');
    }

    if (userRole !== ROLES.ADMIN && project.managerId.toString() !== userId.toString()) {
      throw ApiError.forbidden('Only an Admin or the project manager can change project status.');
    }

    const currentStatus = project.status;
    const allowedNext = ALLOWED_PROJECT_TRANSITIONS[currentStatus] || [];

    if (!allowedNext.includes(newStatus)) {
      throw ApiError.badRequest(
        `Cannot transition project from [${currentStatus}] to [${newStatus}]. Allowed transitions: [${allowedNext.join(', ')}]`
      );
    }

    project.status = newStatus;
    await project.save();

    logger.info(`Project ${projectId} status transitioned: ${currentStatus} -> ${newStatus}`);
    return project;
  }

  /**
   * Soft-delete project.
   */
  async deleteProject(organizationId, projectId) {
    const project = await Project.findOne({
      _id: projectId,
      organizationId,
      isDeleted: false,
    });

    if (!project) {
      throw ApiError.notFound('Project not found.');
    }

    project.isDeleted = true;
    project.deletedAt = new Date();
    await project.save();

    await ProjectMember.deleteMany({ projectId });

    logger.info(`Project ${projectId} soft-deleted from organization ${organizationId}`);
    return { message: 'Project deleted successfully.' };
  }

  /**
   * Add member to project.
   */
  async addMember(organizationId, projectId, { userId, role }, requestingUserId, userRole) {
    const project = await Project.findOne({
      _id: projectId,
      organizationId,
      isDeleted: false,
    });

    if (!project) {
      throw ApiError.notFound('Project not found.');
    }

    if (userRole !== ROLES.ADMIN && project.managerId.toString() !== requestingUserId.toString()) {
      throw ApiError.forbidden('Only an Admin or project manager can add members to this project.');
    }

    await this._verifyOrgMembership(organizationId, userId);

    const existingMember = await ProjectMember.findOne({ projectId, userId });
    if (existingMember) {
      throw ApiError.conflict('User is already a member of this project.');
    }

    const member = await ProjectMember.create({
      projectId,
      userId,
      organizationId,
      role: role || 'MEMBER',
    });

    await notificationService.createAndEmit({
      recipientId: userId,
      organizationId,
      type: NOTIFICATION_TYPE.PROJECT_MEMBER_ADDED,
      title: 'Added to Project',
      message: `You have been added to project "${project.name}".`,
      metadata: { projectId: project._id, role: member.role },
    });

    logger.info(`User ${userId} added to project ${projectId}`);
    return member;
  }

  /**
   * Remove member from project.
   */
  async removeMember(organizationId, projectId, targetUserId, requestingUserId, userRole) {
    const project = await Project.findOne({
      _id: projectId,
      organizationId,
      isDeleted: false,
    });

    if (!project) {
      throw ApiError.notFound('Project not found.');
    }

    if (userRole !== ROLES.ADMIN && project.managerId.toString() !== requestingUserId.toString()) {
      throw ApiError.forbidden('Only an Admin or project manager can remove members from this project.');
    }

    if (project.managerId.toString() === targetUserId.toString()) {
      throw ApiError.badRequest(
        'Cannot remove the project manager. Reassign the manager first.'
      );
    }

    const result = await ProjectMember.deleteOne({ projectId, userId: targetUserId });
    if (result.deletedCount === 0) {
      throw ApiError.notFound('User is not a member of this project.');
    }

    await notificationService.createAndEmit({
      recipientId: targetUserId,
      organizationId,
      type: NOTIFICATION_TYPE.PROJECT_MEMBER_REMOVED,
      title: 'Removed from Project',
      message: `You have been removed from project "${project.name}".`,
      metadata: { projectId: project._id },
    });

    logger.info(`User ${targetUserId} removed from project ${projectId}`);
    return { message: 'Member removed from project successfully.' };
  }

  /**
   * Reassign project manager.
   */
  async assignManager(organizationId, projectId, newManagerId) {
    const project = await Project.findOne({
      _id: projectId,
      organizationId,
      isDeleted: false,
    });

    if (!project) {
      throw ApiError.notFound('Project not found.');
    }

    await this._verifyOrgMembership(organizationId, newManagerId);

    project.managerId = newManagerId;
    await project.save();

    // Ensure new manager is in ProjectMember with role 'MANAGER'
    await ProjectMember.updateOne(
      { projectId, userId: newManagerId },
      { $set: { role: 'MANAGER' }, $setOnInsert: { organizationId, addedAt: new Date() } },
      { upsert: true }
    );

    logger.info(`Project ${projectId} manager reassigned to ${newManagerId}`);
    return project;
  }
}

export const projectService = new ProjectService();

