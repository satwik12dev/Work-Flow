import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import swaggerUi from 'swagger-ui-express';
import { config } from './config/index.js';
import { swaggerSpec } from './config/swagger.js';
import { globalLimiter } from './middlewares/rateLimiter.js';
import { requestLogger } from './middlewares/requestLogger.js';
import { errorHandler } from './middlewares/errorHandler.js';
import { sanitizeInput } from './middlewares/sanitizeInput.js';
import { csrfOriginCheck } from './middlewares/csrf.js';
import { enforceHTTPS, hppProtection } from './middlewares/security.js';
import { ApiResponse } from './utils/ApiResponse.js';
import authRoutes from './modules/auth/auth.routes.js';
import userRoutes from './modules/users/user.routes.js';
import organizationRoutes from './modules/organizations/organization.routes.js';
import teamRoutes from './modules/teams/team.routes.js';
import projectRoutes from './modules/projects/project.routes.js';
import taskRoutes from './modules/tasks/task.routes.js';
import commentRoutes from './modules/comments/comment.routes.js';
import attachmentRoutes from './modules/attachments/attachment.routes.js';
import notificationRoutes from './modules/notifications/notification.routes.js';
import analyticsRoutes from './modules/analytics/analytics.routes.js';

const app = express();

// Trust reverse-proxy headers (X-Forwarded-For, X-Forwarded-Proto)
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ─── SSL / HTTPS Enforcement (Production) ─────────────────────
app.use(enforceHTTPS);

// ─── Security Headers (Helmet + HSTS + CSP) ───────────────────
const strictHelmet = helmet({
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
    },
  },
});

const swaggerHelmet = helmet({
  contentSecurityPolicy: false,
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api-docs')) {
    return swaggerHelmet(req, res, next);
  }
  return strictHelmet(req, res, next);
});

// ─── CORS ─────────────────────────────────────────────────────
app.use(
  cors({
    origin: config.CLIENT_URL,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Organization-Id'],
  })
);

// ─── Global Rate Limiter ──────────────────────────────────────
app.use(globalLimiter);

// ─── Body Parsing ─────────────────────────────────────────────
app.use(express.json({ limit: '16kb' }));
app.use(express.urlencoded({ extended: true, limit: '16kb' }));

// ─── Cookies ──────────────────────────────────────────────────
app.use(cookieParser());

// ─── Input Sanitization & HTTP Parameter Pollution Protection ─
app.use(sanitizeInput);
app.use(hppProtection);

// ─── Request Logging ──────────────────────────────────────────
app.use(requestLogger);

// ─── Health Check ─────────────────────────────────────────────
app.get('/health', (_req, res) => {
  ApiResponse.success(res, 'WorkFlowX API is running', {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
  });
});

// ─── Swagger / OpenAPI Docs ───────────────────────────────────
app.get('/api-docs.json', (_req, res) => res.json(swaggerSpec));
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// ─── API v1 Routes ────────────────────────────────────────────
app.use('/api/v1/auth', csrfOriginCheck, authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/organizations', organizationRoutes);
app.use('/api/v1/teams', teamRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/tasks', taskRoutes);
app.use('/api/v1/comments', commentRoutes);
app.use('/api/v1/attachments', attachmentRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

// ─── 404 Catch-All ────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
  });
});

// ─── Global Error Handler (must be last) ──────────────────────
app.use(errorHandler);

export default app;
