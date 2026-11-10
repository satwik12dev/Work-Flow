import { notificationService } from './notification.service.js';
import { ApiResponse } from '../../utils/ApiResponse.js';
import { asyncHandler } from '../../utils/asyncHandler.js';

class NotificationController {
  list = asyncHandler(async (req, res) => {
    const result = await notificationService.listNotifications(
      req.organizationId,
      req.user._id,
      req.query
    );
    ApiResponse.success(res, 'Notifications retrieved successfully', result);
  });

  unreadCount = asyncHandler(async (req, res) => {
    const result = await notificationService.getUnreadCount(
      req.organizationId,
      req.user._id
    );
    ApiResponse.success(res, 'Unread notification count retrieved', result);
  });

  markAsRead = asyncHandler(async (req, res) => {
    const notification = await notificationService.markAsRead(
      req.organizationId,
      req.user._id,
      req.params.id
    );
    ApiResponse.success(res, 'Notification marked as read', { notification });
  });

  markAllAsRead = asyncHandler(async (req, res) => {
    const result = await notificationService.markAllAsRead(
      req.organizationId,
      req.user._id
    );
    ApiResponse.success(res, 'All notifications marked as read', result);
  });

  delete = asyncHandler(async (req, res) => {
    const result = await notificationService.deleteNotification(
      req.organizationId,
      req.user._id,
      req.params.id
    );
    ApiResponse.success(res, result.message);
  });
}

export const notificationController = new NotificationController();

