# ============================================================
# template-service Dockerfile
# ============================================================

# ---- Build stage ----
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files for dependency resolution
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY nx.json ./

# Copy libs (peer dependencies)
COPY libs/ ./libs/

# Copy template-service
COPY apps/template-service/ ./apps/template-service/

# Install dependencies
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# Build
RUN npx nx build template-service || npx tsc -p apps/template-service/tsconfig.json

# ---- Production stage ----
FROM node:20-alpine AS runner

WORKDIR /app

# Copy built artifacts and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/template-service/dist ./dist
COPY --from=builder /app/apps/template-service/package.json ./package.json
COPY --from=builder /app/libs ./libs

ENV NODE_ENV=production
ENV PORT=3005

EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3005/health || exit 1

CMD ["node", "dist/main.js"]
