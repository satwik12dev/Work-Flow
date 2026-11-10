import { Notification } from './notification.model.js';
import { emitNotificationToUser } from '../../sockets/index.js';
import { ApiError } from '../../utils/ApiError.js';
import { getPaginationParams, createPaginationResponse } from '../../utils/pagination.js';
import { logger } from '../../config/logger.js';

class NotificationService {
  /**
   * Create a persistent in-app notification and emit it over Socket.IO.
   */
  async createAndEmit({ recipientId, organizationId, type, title, message, metadata = {} }) {
    if (!recipientId || !organizationId) return null;

    try {
      const notification = await Notification.create({
        recipientId,
        organizationId,
        type,
        title,
        message,
        metadata,
      });

      emitNotificationToUser(organizationId, recipientId, notification.toObject());
      return notification;
    } catch (error) {
      logger.error(`Failed to create/emit notification [${type}]: ${error.message}`);
      return null;
    }
  }

  /**
   * List notifications for the authenticated user within the organization.
   */
  async listNotifications(organizationId, recipientId, query) {
    const { page, limit, skip, sort } = getPaginationParams(query);
    const filter = { organizationId, recipientId };

    if (query.isRead === 'true') filter.isRead = true;
    if (query.isRead === 'false') filter.isRead = false;

    const [notifications, totalDocs] = await Promise.all([
      Notification.find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(filter),
    ]);

    return {
      notifications,
      pagination: createPaginationResponse(totalDocs, page, limit),
    };
  }

  /**
   * Get unread notification count for the user in the active organization.
   */
  async getUnreadCount(organizationId, recipientId) {
    const unreadCount = await Notification.countDocuments({
      organizationId,
      recipientId,
      isRead: false,
    });

    return { unreadCount };
  }

  /**
   * Mark a single notification as read (verified ownership).
   */
  async markAsRead(organizationId, recipientId, notificationId) {
    const notification = await Notification.findOneAndUpdate(
      { _id: notificationId, organizationId, recipientId },
      { isRead: true, readAt: new Date() },
      { new: true }
    );

    if (!notification) {
      throw ApiError.notFound('Notification not found.');
    }

    return notification;
  }

  /**
   * Mark all unread notifications for the user in the organization as read.
   */
  async markAllAsRead(organizationId, recipientId) {
    const result = await Notification.updateMany(
      { organizationId, recipientId, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    return { modifiedCount: result.modifiedCount };
  }

  /**
   * Delete a notification (verified ownership).
   */
  async deleteNotification(organizationId, recipientId, notificationId) {
    const result = await Notification.deleteOne({
      _id: notificationId,
      organizationId,
      recipientId,
    });

    if (result.deletedCount === 0) {
      throw ApiError.notFound('Notification not found.');
    }

    return { message: 'Notification deleted successfully.' };
  }
}

export const notificationService = new NotificationService();

