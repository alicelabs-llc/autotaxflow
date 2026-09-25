# AutoTaxFlow Web (Next.js) Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/shared/package.json ./packages/shared/

RUN npm ci --silent

COPY apps/web ./apps/web
COPY packages/shared ./packages/shared

WORKDIR /app/apps/web
RUN npx next build

# --- runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/web/.next ./apps/web/.next
COPY --from=builder /app/apps/web/public ./apps/web/public
COPY --from=builder /app/apps/web/package.json ./apps/web/
COPY --from=builder /app/apps/web/next.config.js ./apps/web/

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["npx", "next", "start"]
