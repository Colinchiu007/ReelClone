# ============================================================
# template-service Dockerfile
# ============================================================

# ---- Build stage ----
FROM node:18-alpine AS builder

WORKDIR /app

# Copy workspace root files for dependency resolution
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# Copy libs (peer dependencies)
COPY libs/ ./libs/

# Copy template-service
COPY apps/template-service/ ./apps/template-service/

# Install dependencies
RUN npm ci || npm install

# Build
RUN npm run build --workspace @reelclone/template-service || npx tsc -p apps/template-service/tsconfig.json

# ---- Production stage ----
FROM node:18-alpine AS production

WORKDIR /app

# Copy built artifacts and dependencies
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/template-service/dist ./dist
COPY --from=builder /app/apps/template-service/package.json ./package.json
COPY --from=builder /app/libs ./libs

ENV NODE_ENV=production
ENV PORT=3005

EXPOSE 3005

CMD ["node", "dist/main.js"]
