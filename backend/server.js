import http from 'http';
import https from 'https';
import fs from 'fs';
import app from './src/app.js';
import { config } from './src/config/index.js';
import { logger } from './src/config/logger.js';
import { connectDatabase, disconnectDatabase } from './src/config/database.js';
import { connectRedis, disconnectRedis } from './src/config/redis.js';
import { configureCloudinary } from './src/config/cloudinary.js';
import { initSocketServer } from './src/sockets/index.js';

let server;
if (config.SSL_KEY_PATH && config.SSL_CERT_PATH) {
  const sslOptions = {
    key: fs.readFileSync(config.SSL_KEY_PATH),
    cert: fs.readFileSync(config.SSL_CERT_PATH),
  };
  server = https.createServer(sslOptions, app);
  logger.info('HTTPS/SSL server mode enabled');
} else {
  server = http.createServer(app);
}

/**
 * Boot sequence: connect MongoDB → connect Redis → configure Cloudinary → init Socket.IO → start HTTP server.
 */
const startServer = async () => {
    try {
        // 1. Database
        await connectDatabase();

        // 2. Redis
        connectRedis();

        // 3. Cloudinary
        configureCloudinary();

        // 4. Socket.IO
        initSocketServer(server);

        // 3. HTTP server
        server.listen(config.PORT, () => {
            logger.info(
                `🚀 WorkFlowX server running on port ${config.PORT} [${config.NODE_ENV}]`
            );
            logger.info(`📋 Health check: ${config.APP_URL}/health`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

// ─── Graceful Shutdown ────────────────────────────────────────

const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received. Starting graceful shutdown…`);

    server.close(async () => {
        logger.info('HTTP server closed');

        try {
            await disconnectDatabase();
            await disconnectRedis();
            logger.info('All connections closed. Exiting.');
            process.exit(0);
        } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    });

    // Force-exit safety net
    setTimeout(() => {
        logger.error('Forced shutdown after 10 s timeout');
        process.exit(1);
    }, 10_000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', reason);
});

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

// ─── Start ────────────────────────────────────────────────────
startServer();

export default server;

