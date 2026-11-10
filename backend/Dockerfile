FROM node:20-alpine AS base

WORKDIR /app

# Create non-root user for security
RUN addgroup -S workflowx && adduser -S workflowx -G workflowx

# Copy dependency manifests first for layer caching
COPY package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source
COPY server.js ./
COPY src ./src
COPY docs ./docs

# Create logs directory owned by non-root user
RUN mkdir -p logs && chown -R workflowx:workflowx /app

USER workflowx

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5000/health || exit 1

CMD ["node", "server.js"]

