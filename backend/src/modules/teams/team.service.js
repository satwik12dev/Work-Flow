import mongoose from 'mongoose';
import { Team } from './team.model.js';
import { TeamMember } from './teamMember.model.js';
import { OrganizationMember } from '../organizations/organizationMember.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { escapeRegex } from '../../utils/helpers.js';
import { getPaginationParams, createPaginationResponse } from '../../utils/pagination.js';
import { MEMBER_STATUS } from '../auth/auth.constants.js';
import { logger } from '../../config/logger.js';

class TeamService {
  /**
   * Helper: Ensure target user is an active member of the organization.
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
   * Create a new team within an organization.
   */
  async createTeam(organizationId, { name, description, managerId }, creatorId) {
    // 1. Name uniqueness within organization
    const existing = await Team.findOne({
      organizationId,
      name: new RegExp(`^${escapeRegex(name.trim())}$`, 'i'),
      isDeleted: false,
    });
    if (existing) {
      throw ApiError.conflict('A team with this name already exists in your organization.');
    }

    // 2. Validate manager if provided
    if (managerId) {
      await this._verifyOrgMembership(organizationId, managerId);
    }

    const team = await Team.create({
      name: name.trim(),
      description: description || '',
      organizationId,
      managerId: managerId || null,
      createdBy: creatorId,
    });

    // 3. Automatically add creator and manager to TeamMember
    const membersToAdd = new Set([creatorId.toString()]);
    if (managerId) membersToAdd.add(managerId.toString());

    const memberDocs = Array.from(membersToAdd).map((userId) => ({
      teamId: team._id,
      userId: new mongoose.Types.ObjectId(userId),
      organizationId,
    }));

    await TeamMember.insertMany(memberDocs);
    logger.info(`Team "${team.name}" created in org ${organizationId}`);

    return team;
  }

  /**
   * List teams in an organization with pagination and member counts.
   */
  async listTeams(organizationId, query) {
    const { page, limit, skip, sort } = getPaginationParams(query);
    const filter = { organizationId, isDeleted: false };

    if (query.managerId) {
      filter.managerId = query.managerId;
    }

    if (query.search) {
      const searchRegex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [{ name: searchRegex }, { description: searchRegex }];
    }

    const [teams, totalDocs] = await Promise.all([
      Team.find(filter)
        .populate('managerId', 'name email')
        .populate('createdBy', 'name email')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Team.countDocuments(filter),
    ]);

    // Attach member count to each team
    const teamIds = teams.map((t) => t._id);
    const memberCounts = await TeamMember.aggregate([
      { $match: { teamId: { $in: teamIds } } },
      { $group: { _id: '$teamId', count: { $sum: 1 } } },
    ]);

    const countMap = new Map(memberCounts.map((c) => [c._id.toString(), c.count]));

    const teamsWithCounts = teams.map((team) => ({
      ...team,
      memberCount: countMap.get(team._id.toString()) || 0,
    }));

    return {
      teams: teamsWithCounts,
      pagination: createPaginationResponse(totalDocs, page, limit),
    };
  }

  /**
   * Get single team details along with members.
   */
  async getTeamById(organizationId, teamId) {
    const team = await Team.findOne({
      _id: teamId,
      organizationId,
      isDeleted: false,
    })
      .populate('managerId', 'name email')
      .populate('createdBy', 'name email');

    if (!team) {
      throw ApiError.notFound('Team not found in this organization.');
    }

    const members = await TeamMember.find({ teamId })
      .populate('userId', 'name email lastLoginAt')
      .lean();

    return {
      ...team.toJSON(),
      members: members.map((m) => ({
        memberId: m._id,
        user: m.userId,
        addedAt: m.addedAt,
      })),
    };
  }

  /**
   * Update team details.
   */
  async updateTeam(organizationId, teamId, updates) {
    const team = await Team.findOne({
      _id: teamId,
      organizationId,
      isDeleted: false,
    });

    if (!team) {
      throw ApiError.notFound('Team not found.');
    }

    if (updates.name && updates.name.trim() !== team.name) {
      const duplicate = await Team.findOne({
        organizationId,
        name: new RegExp(`^${escapeRegex(updates.name.trim())}$`, 'i'),
        _id: { $ne: teamId },
        isDeleted: false,
      });
      if (duplicate) {
        throw ApiError.conflict('Another team with this name already exists.');
      }
      team.name = updates.name.trim();
    }

    if (updates.description !== undefined) {
      team.description = updates.description;
    }

    if (updates.managerId !== undefined) {
      if (updates.managerId) {
        await this._verifyOrgMembership(organizationId, updates.managerId);
        // Ensure manager is in team members
        await TeamMember.updateOne(
          { teamId, userId: updates.managerId },
          { $setOnInsert: { organizationId, addedAt: new Date() } },
          { upsert: true }
        );
      }
      team.managerId = updates.managerId;
    }

    await team.save();
    return team;
  }

  /**
   * Soft-delete a team.
   */
  async deleteTeam(organizationId, teamId) {
    const team = await Team.findOne({
      _id: teamId,
      organizationId,
      isDeleted: false,
    });

    if (!team) {
      throw ApiError.notFound('Team not found.');
    }

    team.isDeleted = true;
    team.deletedAt = new Date();
    await team.save();

    // Clean up team member records
    await TeamMember.deleteMany({ teamId });

    logger.info(`Team ${teamId} soft-deleted from organization ${organizationId}`);
    return { message: 'Team deleted successfully.' };
  }

  /**
   * Add a member to a team.
   */
  async addMember(organizationId, teamId, userId) {
    const team = await Team.findOne({
      _id: teamId,
      organizationId,
      isDeleted: false,
    });

    if (!team) {
      throw ApiError.notFound('Team not found.');
    }

    // Verify user is an active org member
    await this._verifyOrgMembership(organizationId, userId);

    const existingMember = await TeamMember.findOne({ teamId, userId });
    if (existingMember) {
      throw ApiError.conflict('User is already a member of this team.');
    }

    const member = await TeamMember.create({
      teamId,
      userId,
      organizationId,
    });

    logger.info(`User ${userId} added to team ${teamId}`);
    return member;
  }

  /**
   * Remove a member from a team.
   */
  async removeMember(organizationId, teamId, userId) {
    const team = await Team.findOne({
      _id: teamId,
      organizationId,
      isDeleted: false,
    });

    if (!team) {
      throw ApiError.notFound('Team not found.');
    }

    // Safeguard: Cannot remove manager without reassigning
    if (team.managerId && team.managerId.toString() === userId.toString()) {
      throw ApiError.badRequest(
        'Cannot remove the team manager. Please reassign the manager first.'
      );
    }

    const result = await TeamMember.deleteOne({ teamId, userId });
    if (result.deletedCount === 0) {
      throw ApiError.notFound('User is not a member of this team.');
    }

    logger.info(`User ${userId} removed from team ${teamId}`);
    return { message: 'Member removed from team successfully.' };
  }

  /**
   * Assign or replace team manager.
   */
  async assignManager(organizationId, teamId, managerId) {
    const team = await Team.findOne({
      _id: teamId,
      organizationId,
      isDeleted: false,
    });

    if (!team) {
      throw ApiError.notFound('Team not found.');
    }

    await this._verifyOrgMembership(organizationId, managerId);

    team.managerId = managerId;
    await team.save();

    // Ensure manager is a team member
    await TeamMember.updateOne(
      { teamId, userId: managerId },
      { $setOnInsert: { organizationId, addedAt: new Date() } },
      { upsert: true }
    );

    logger.info(`User ${managerId} assigned as manager for team ${teamId}`);
    return team;
  }

  /**
   * Get team workload overview.
   */
  async getTeamWorkload(organizationId, teamId) {
    const team = await Team.findOne({
      _id: teamId,
      organizationId,
      isDeleted: false,
    });

    if (!team) {
      throw ApiError.notFound('Team not found.');
    }

    const members = await TeamMember.find({ teamId })
      .populate('userId', 'name email')
      .lean();

    const memberUserIds = members.map((m) => m.userId?._id).filter(Boolean);

    // Dynamic aggregation on tasks for team members
    const TaskModel = mongoose.models.Task;
    let workloadMetrics = [];

    if (TaskModel) {
      workloadMetrics = await TaskModel.aggregate([
        {
          $match: {
            organizationId: new mongoose.Types.ObjectId(organizationId),
            assignedTo: { $in: memberUserIds },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: '$assignedTo',
            totalTasks: { $sum: 1 },
            completedTasks: {
              $sum: { $cond: [{ $eq: ['$status', 'DONE'] }, 1, 0] },
            },
            inProgressTasks: {
              $sum: { $cond: [{ $eq: ['$status', 'IN_PROGRESS'] }, 1, 0] },
            },
            totalEstimatedHours: { $sum: '$estimatedHours' },
            totalActualHours: { $sum: '$actualHours' },
          },
        },
      ]);
    }

    const metricsMap = new Map(
      workloadMetrics.map((w) => [w._id.toString(), w])
    );

    const workload = members.map((m) => {
      const userIdStr = m.userId?._id?.toString();
      const stats = metricsMap.get(userIdStr) || {
        totalTasks: 0,
        completedTasks: 0,
        inProgressTasks: 0,
        totalEstimatedHours: 0,
        totalActualHours: 0,
      };

      return {
        user: m.userId,
        stats,
      };
    });

    return {
      team: { _id: team._id, name: team.name },
      workload,
    };
  }
}

export const teamService = new TeamService();

