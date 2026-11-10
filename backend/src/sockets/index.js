import { Server } from 'socket.io';
import { config } from '../config/index.js';
import { logger } from '../config/logger.js';
import { socketAuthenticate } from './auth.socket.js';
import { registerNotificationHandlers, getOrgUserRoom } from './notification.socket.js';

/** @type {Server | null} */
let io = null;

/**
 * Initialize Socket.IO server attached to the HTTP server.
 */
export const initSocketServer = (httpServer) => {
  io = new Server(httpServer, {
    cors: {
      origin: config.CLIENT_URL,
      credentials: true,
      methods: ['GET', 'POST'],
    },
  });

  // Authenticate every socket handshake
  io.use(socketAuthenticate);

  io.on('connection', (socket) => {
    logger.debug(`Socket connected: ${socket.id} (User: ${socket.user._id})`);

    registerNotificationHandlers(io, socket);

    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnected: ${socket.id} (${reason})`);
    });
  });

  logger.info('Socket.IO server initialized with JWT authentication');
  return io;
};

/**
 * Get the initialized Socket.IO instance (returns null if not initialized, e.g. in tests/workers).
 */
export const getSocketIO = () => io;

/**
 * Emit a real-time notification event to a verified recipient inside their organization room.
 */
export const emitNotificationToUser = (organizationId, recipientId, notification) => {
  if (!io) return;

  const orgRoom = getOrgUserRoom(organizationId, recipientId);
  io.to(orgRoom).emit('notification:new', notification);

  // Also emit unread event on user room for cross-org notifications (e.g. org invitations)
  if (notification.type === 'ORG_INVITATION') {
    io.to(`user:${recipientId.toString()}`).emit('notification:new', notification);
  }
};

