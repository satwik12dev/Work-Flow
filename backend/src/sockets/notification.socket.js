import mongoose from 'mongoose';
import { OrganizationMember } from '../modules/organizations/organizationMember.model.js';
import { MEMBER_STATUS } from '../modules/auth/auth.constants.js';
import { logger } from '../config/logger.js';

/**
 * Build deterministic room name scoped by both organization and user.
 * Guarantees multi-tenant isolation for real-time events.
 */
export const getOrgUserRoom = (organizationId, userId) =>
  `org:${organizationId.toString()}:user:${userId.toString()}`;

/**
 * Register socket room subscription handlers with org-membership verification.
 */
export const registerNotificationHandlers = (io, socket) => {
  const userId = socket.user._id.toString();

  // Join personal room for cross-org notifications (like invitations)
  socket.join(`user:${userId}`);

  // Join an organization-scoped room only after verifying active membership
  socket.on('join:organization', async (organizationId, callback) => {
    try {
      if (!organizationId || !mongoose.Types.ObjectId.isValid(organizationId)) {
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Invalid organization ID' });
        }
        return;
      }

      const member = await OrganizationMember.findOne({
        organizationId,
        userId: socket.user._id,
        status: MEMBER_STATUS.ACTIVE,
      });

      if (!member) {
        logger.warn(`Socket user ${userId} denied room join for org ${organizationId}`);
        if (typeof callback === 'function') {
          callback({ success: false, message: 'Not an active member of this organization' });
        }
        return;
      }

      const room = getOrgUserRoom(organizationId, userId);
      await socket.join(room);
      logger.debug(`Socket ${socket.id} joined room ${room}`);

      if (typeof callback === 'function') {
        callback({ success: true, room });
      }
    } catch (error) {
      logger.error(`Error joining organization room: ${error.message}`);
      if (typeof callback === 'function') {
        callback({ success: false, message: 'Failed to join organization room' });
      }
    }
  });

  socket.on('leave:organization', async (organizationId) => {
    if (organizationId && mongoose.Types.ObjectId.isValid(organizationId)) {
      await socket.leave(getOrgUserRoom(organizationId, userId));
    }
  });
};

