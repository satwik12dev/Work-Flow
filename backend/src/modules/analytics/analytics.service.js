import mongoose from 'mongoose';
import { OrganizationMember } from '../organizations/organizationMember.model.js';
import { Team } from '../teams/team.model.js';
import { Project } from '../projects/project.model.js';
import { ProjectMember } from '../projects/projectMember.model.js';
import { Task } from '../tasks/task.model.js';
import { ActivityLog } from '../../models/activityLog.model.js';
import { ApiError } from '../../utils/ApiError.js';
import { PROJECT_STATUS } from '../../constants/projectStatus.js';
import { TASK_STATUS } from '../../constants/taskStatus.js';
import { ROLES } from '../../constants/roles.js';
import { MEMBER_STATUS } from '../auth/auth.constants.js';

class AnalyticsService {
  /**
   * Organization-wide dashboard metrics using MongoDB aggregation pipelines.
   */
  async getOrganizationDashboard(organizationId) {
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const now = new Date();

    const [memberStats, totalTeams, projectStats, taskStats] = await Promise.all([
      OrganizationMember.aggregate([
        { $match: { organizationId: orgId, status: MEMBER_STATUS.ACTIVE } },
        {
          $group: {
            _id: '$role',
            count: { $sum: 1 },
          },
        },
      ]),
      Team.countDocuments({ organizationId: orgId, isDeleted: false }),
      Project.aggregate([
        { $match: { organizationId: orgId, isDeleted: false } },
        {
          $group: {
            _id: null,
            totalProjects: { $sum: 1 },
            activeProjects: {
              $sum: { $cond: [{ $eq: ['$status', PROJECT_STATUS.ACTIVE] }, 1, 0] },
            },
            completedProjects: {
              $sum: { $cond: [{ $eq: ['$status', PROJECT_STATUS.COMPLETED] }, 1, 0] },
            },
          },
        },
      ]),
      Task.aggregate([
        { $match: { organizationId: orgId, isDeleted: false } },
        {
          $group: {
            _id: null,
            totalTasks: { $sum: 1 },
            completedTasks: {
              $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.DONE] }, 1, 0] },
            },
            overdueTasks: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$dueDate', null] },
                      { $lt: ['$dueDate', now] },
                      { $ne: ['$status', TASK_STATUS.DONE] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
    ]);

    const totalEmployees = memberStats.reduce((sum, item) => sum + item.count, 0);
    const roleBreakdown = memberStats.reduce((acc, item) => {
      acc[item._id] = item.count;
      return acc;
    }, {});

    const pStats = projectStats[0] || {
      totalProjects: 0,
      activeProjects: 0,
      completedProjects: 0,
    };

    const tStats = taskStats[0] || {
      totalTasks: 0,
      completedTasks: 0,
      overdueTasks: 0,
    };

    return {
      totalEmployees,
      roleBreakdown,
      totalTeams,
      totalProjects: pStats.totalProjects,
      activeProjects: pStats.activeProjects,
      completedProjects: pStats.completedProjects,
      totalTasks: tStats.totalTasks,
      completedTasks: tStats.completedTasks,
      overdueTasks: tStats.overdueTasks,
    };
  }

  /**
   * Manager dashboard: managed projects, team workload, and task summary.
   */
  async getManagerDashboard(organizationId, managerId) {
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const mgrId = new mongoose.Types.ObjectId(managerId);
    const now = new Date();

    const managedProjects = await Project.find({
      organizationId: orgId,
      managerId: mgrId,
      isDeleted: false,
    })
      .select('_id name status priority endDate')
      .lean();

    const projectIds = managedProjects.map((p) => p._id);

    if (projectIds.length === 0) {
      return {
        managedProjectsCount: 0,
        managedProjects: [],
        assignedTasks: 0,
        pendingTasks: 0,
        completedTasks: 0,
        overdueTasks: 0,
        teamWorkload: [],
      };
    }

    const [taskSummary, teamWorkload] = await Promise.all([
      Task.aggregate([
        {
          $match: {
            organizationId: orgId,
            projectId: { $in: projectIds },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: null,
            assignedTasks: {
              $sum: { $cond: [{ $ne: ['$assignedTo', null] }, 1, 0] },
            },
            pendingTasks: {
              $sum: { $cond: [{ $ne: ['$status', TASK_STATUS.DONE] }, 1, 0] },
            },
            completedTasks: {
              $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.DONE] }, 1, 0] },
            },
            overdueTasks: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$dueDate', null] },
                      { $lt: ['$dueDate', now] },
                      { $ne: ['$status', TASK_STATUS.DONE] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      Task.aggregate([
        {
          $match: {
            organizationId: orgId,
            projectId: { $in: projectIds },
            assignedTo: { $ne: null },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: '$assignedTo',
            totalAssigned: { $sum: 1 },
            completed: {
              $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.DONE] }, 1, 0] },
            },
            inProgress: {
              $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.IN_PROGRESS] }, 1, 0] },
            },
            overdue: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$dueDate', null] },
                      { $lt: ['$dueDate', now] },
                      { $ne: ['$status', TASK_STATUS.DONE] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            estimatedHours: { $sum: '$estimatedHours' },
            actualHours: { $sum: '$actualHours' },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        {
          $project: {
            _id: 0,
            userId: '$_id',
            name: '$user.name',
            email: '$user.email',
            totalAssigned: 1,
            completed: 1,
            inProgress: 1,
            overdue: 1,
            estimatedHours: 1,
            actualHours: 1,
          },
        },
      ]),
    ]);

    const summary = taskSummary[0] || {
      assignedTasks: 0,
      pendingTasks: 0,
      completedTasks: 0,
      overdueTasks: 0,
    };

    return {
      managedProjectsCount: managedProjects.length,
      managedProjects,
      ...summary,
      teamWorkload,
    };
  }

  /**
   * Employee / Personal dashboard: my tasks breakdown and upcoming deadlines.
   */
  async getMyDashboard(organizationId, userId) {
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const uid = new mongoose.Types.ObjectId(userId);
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    const [taskAgg, upcomingDeadlines] = await Promise.all([
      Task.aggregate([
        {
          $match: {
            organizationId: orgId,
            assignedTo: uid,
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: null,
            myTasks: { $sum: 1 },
            pendingTasks: {
              $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.TODO] }, 1, 0] },
            },
            inProgressTasks: {
              $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.IN_PROGRESS] }, 1, 0] },
            },
            inReviewTasks: {
              $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.IN_REVIEW] }, 1, 0] },
            },
            blockedTasks: {
              $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.BLOCKED] }, 1, 0] },
            },
            completedTasks: {
              $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.DONE] }, 1, 0] },
            },
            overdueTasks: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$dueDate', null] },
                      { $lt: ['$dueDate', now] },
                      { $ne: ['$status', TASK_STATUS.DONE] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
          },
        },
      ]),
      Task.find({
        organizationId: orgId,
        assignedTo: uid,
        isDeleted: false,
        status: { $ne: TASK_STATUS.DONE },
        dueDate: { $gte: now, $lte: in7Days },
      })
        .populate('projectId', 'name')
        .select('title status priority dueDate projectId')
        .sort({ dueDate: 1 })
        .limit(10)
        .lean(),
    ]);

    const stats = taskAgg[0] || {
      myTasks: 0,
      pendingTasks: 0,
      inProgressTasks: 0,
      inReviewTasks: 0,
      blockedTasks: 0,
      completedTasks: 0,
      overdueTasks: 0,
    };
    delete stats._id;

    return {
      ...stats,
      upcomingDeadlines,
    };
  }

  /**
   * Project-specific analytics: completion %, grouped status/priority, workload, and activity.
   */
  async getProjectAnalytics(organizationId, projectId, userId, userRole) {
    const orgId = new mongoose.Types.ObjectId(organizationId);
    const projId = new mongoose.Types.ObjectId(projectId);
    const now = new Date();

    const project = await Project.findOne({
      _id: projId,
      organizationId: orgId,
      isDeleted: false,
    }).select('name status priority managerId startDate endDate');

    if (!project) {
      throw ApiError.notFound('Project not found.');
    }

    if (userRole === ROLES.EMPLOYEE) {
      const isMember = await ProjectMember.findOne({ projectId: projId, userId });
      if (!isMember) {
        throw ApiError.forbidden('You do not have permission to view analytics for this project.');
      }
    }

    const [tasksByStatus, tasksByPriority, employeeWorkload, projectTasks] = await Promise.all([
      Task.aggregate([
        { $match: { organizationId: orgId, projectId: projId, isDeleted: false } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      Task.aggregate([
        { $match: { organizationId: orgId, projectId: projId, isDeleted: false } },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
      Task.aggregate([
        {
          $match: {
            organizationId: orgId,
            projectId: projId,
            assignedTo: { $ne: null },
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: '$assignedTo',
            totalTasks: { $sum: 1 },
            completedTasks: {
              $sum: { $cond: [{ $eq: ['$status', TASK_STATUS.DONE] }, 1, 0] },
            },
            overdueTasks: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ['$dueDate', null] },
                      { $lt: ['$dueDate', now] },
                      { $ne: ['$status', TASK_STATUS.DONE] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            estimatedHours: { $sum: '$estimatedHours' },
            actualHours: { $sum: '$actualHours' },
          },
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user',
          },
        },
        { $unwind: '$user' },
        {
          $project: {
            _id: 0,
            userId: '$_id',
            name: '$user.name',
            email: '$user.email',
            totalTasks: 1,
            completedTasks: 1,
            overdueTasks: 1,
            estimatedHours: 1,
            actualHours: 1,
          },
        },
      ]),
      Task.find({ organizationId: orgId, projectId: projId }).select('_id').lean(),
    ]);

    const taskIds = projectTasks.map((t) => t._id);
    const activitySummary = await ActivityLog.aggregate([
      {
        $match: {
          organizationId: orgId,
          $or: [
            { entityType: 'PROJECT', entityId: projId },
            { entityType: 'TASK', entityId: { $in: taskIds } },
          ],
        },
      },
      { $group: { _id: '$action', count: { $sum: 1 } } },
    ]);

    const statusMap = tasksByStatus.reduce((acc, s) => {
      acc[s._id] = s.count;
      return acc;
    }, {});

    const priorityMap = tasksByPriority.reduce((acc, p) => {
      acc[p._id] = p.count;
      return acc;
    }, {});

    const totalTasks = tasksByStatus.reduce((sum, s) => sum + s.count, 0);
    const completedTasks = statusMap[TASK_STATUS.DONE] || 0;
    const completionPercentage =
      totalTasks === 0 ? 0 : Math.round((completedTasks / totalTasks) * 100);

    return {
      project,
      totalTasks,
      completionPercentage,
      tasksByStatus: statusMap,
      tasksByPriority: priorityMap,
      employeeWorkload,
      activitySummary: activitySummary.reduce((acc, a) => {
        acc[a._id] = a.count;
        return acc;
      }, {}),
    };
  }
}

export const analyticsService = new AnalyticsService();

