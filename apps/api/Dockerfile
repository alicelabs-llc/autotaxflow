# AutoTaxFlow API Dockerfile
# Multi-stage build: build TS → runtime image with only dist + node_modules
FROM node:20-alpine AS builder
WORKDIR /app

# Copy lockfile + workspaces manifest first for caching
COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY turbo.json ./
COPY apps/api/package.json ./apps/api/
COPY packages/db/package.json ./packages/db/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --silent

# Copy source
COPY apps/api ./apps/api
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared

# Build
RUN npx prisma generate --schema packages/db/prisma/schema.prisma
RUN npx tsc -p apps/api/tsconfig.json

# --- runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001

# Only ship the compiled output + production deps
COPY package.json package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/packages/db/src ./packages/db/src
COPY --from=builder /app/packages/db/package.json ./packages/db/
COPY --from=builder /app/packages/shared/src ./packages/shared/src
COPY --from=builder /app/packages/shared/package.json ./packages/shared/

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O - http://localhost:3001/health || exit 1

EXPOSE 3001
CMD ["node", "apps/api/dist/index.js"]
