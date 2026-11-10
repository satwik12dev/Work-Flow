# WorkFlowX — Multi-Tenant Project & Team Management Backend

WorkFlowX is a production-oriented, multi-tenant **Modular Monolith** backend built with Node.js, Express 5 (ES Modules), MongoDB (Mongoose), Redis, BullMQ, Brevo Transactional Email API, Cloudinary, and Socket.IO.

---

## Key Features

- **Multi-Tenant Organization Isolation**: Users can belong to multiple organizations with distinct roles (`ADMIN`, `MANAGER`, `EMPLOYEE`). Every query is scoped via `X-Organization-Id` and verified in `orgContext` + `authorize` middlewares.
- **JWT & Session Security**: Short-lived access tokens (15m) + rotating refresh tokens (7d) stored as SHA-256 hashes in MongoDB HTTP-only cookies with reuse detection and multi-device session revocation.
- **Redis OTP Verification**: Cryptographically secure 6-digit OTPs stored strictly as HMAC-SHA256 hashes with 5-minute TTL, 60-second resend cooldown, and 5-attempt lockout.
- **Reliable Email Delivery (Transactional Outbox + BullMQ + Brevo)**: Task assignments, reassignments, invitations, OTPs, and deadline reminders are recorded atomically in `EmailOutbox` and processed asynchronously by BullMQ workers using `@getbrevo/brevo`.
- **Projects, Tasks, Comments & Cloudinary Attachments**: Full lifecycle state machines, activity audit logs, comment moderation, and validated file uploads (Multer + Cloudinary).
- **Real-Time Socket.IO Notifications**: JWT-authenticated WebSockets with organization-room membership checks plus hourly BullMQ deadline/overdue scanning.
- **Analytics & Dashboards**: MongoDB aggregation pipelines for Organization, Manager, Employee, and Project analytics.

---

## Tech Stack

- **Runtime**: Node.js 20+, Express 5 (ES Modules)
- **Database**: MongoDB 7+ (Mongoose 8)
- **Cache & Queues**: Redis 7+, ioredis, BullMQ
- **Email**: Brevo (`@getbrevo/brevo`)
- **Uploads**: Multer + Cloudinary
- **Real-Time**: Socket.IO
- **Security**: Helmet, CORS, `express-rate-limit`, `cookie-parser`, Zod, bcrypt, NoSQL sanitization, CSRF origin checks
- **Testing & Docs**: Jest, Supertest, Swagger UI (`/api-docs`), Winston

---

## Quick Start (Local Development)

### 1. Prerequisites
- Node.js >= 20
- MongoDB running locally (or Docker)
- Redis running locally (or Docker)

### 2. Installation & Configuration
```bash
cd Backend
npm install
cp .env.example .env
```
Edit `.env` and fill in your secrets (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `OTP_SECRET`, `BREVO_API_KEY`, `CLOUDINARY_*`).

### 3. Run API Server & Background Worker
```bash
# Terminal 1: Start Express API + Socket.IO server
npm run dev

# Terminal 2: Start BullMQ Email & Deadline Workers
npm run worker
```
- Health Check: `http://localhost:5000/health`
- Swagger UI: `http://localhost:5000/api-docs`
- OpenAPI JSON: `http://localhost:5000/api-docs.json`

---

## Docker Compose Deployment (Recommended)

Docker Compose launches **MongoDB (auto-initialized as Replica Set `rs0`)**, **Redis**, the **API Server**, and the **Background Worker** with health checks and persistent volumes:

```bash
cp .env.example .env
# Update .env with production secrets
docker compose up -d --build
```

Check container status & logs:
```bash
docker compose ps
docker compose logs -f api worker
```

Graceful shutdown:
```bash
docker compose down
```

---

## Automated Testing

Run the Jest + Supertest unit and integration test suite against the isolated `workflowx_test` database:
```bash
npm test
```

> Note: Automated tests mock Brevo email API calls and simulate Redis TTLs deterministically while running full API assertions against MongoDB.

---

## API Documentation

- **Swagger UI**: `GET /api-docs`
- **OpenAPI 3.0 Spec**: [docs/api/openapi.json](./docs/api/openapi.json)
- **Postman Collection**: [docs/postman/WorkFlowX.postman_collection.json](./docs/postman/WorkFlowX.postman_collection.json)

