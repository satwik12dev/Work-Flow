import { analyticsService } from './analytics.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

class AnalyticsController {
  getOrganizationDashboard = asyncHandler(async (req, res) => {
    const analytics = await analyticsService.getOrganizationDashboard(req.organizationId);
    ApiResponse.success(res, 'Organization analytics retrieved successfully', { analytics });
  });

  getManagerDashboard = asyncHandler(async (req, res) => {
    const analytics = await analyticsService.getManagerDashboard(
      req.organizationId,
      req.user._id
    );
    ApiResponse.success(res, 'Manager dashboard retrieved successfully', { analytics });
  });

  getMyDashboard = asyncHandler(async (req, res) => {
    const analytics = await analyticsService.getMyDashboard(
      req.organizationId,
      req.user._id
    );
    ApiResponse.success(res, 'Personal dashboard retrieved successfully', { analytics });
  });

  getProjectAnalytics = asyncHandler(async (req, res) => {
    const analytics = await analyticsService.getProjectAnalytics(
      req.organizationId,
      req.params.projectId,
      req.user._id,
      req.orgMember.role
    );
    ApiResponse.success(res, 'Project analytics retrieved successfully', { analytics });
  });
}

export const analyticsController = new AnalyticsController();

