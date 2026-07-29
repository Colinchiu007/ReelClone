# ============================================================
# ReelClone asset-service Dockerfile
# 多阶段构建：构建 TypeScript → 运行 Node.js
# ============================================================

# -------------------- Stage 1: 构建 --------------------
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 workspace 根配置
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY nx.json ./

# 复制 workspace 包（libs + apps）
COPY libs/ ./libs/
COPY apps/ ./apps/

# 安装全部依赖（含 devDependencies，用于构建）
RUN npm ci || npm install

# 构建 asset-service
RUN npx nx build asset-service || npx tsc -p apps/asset-service/tsconfig.json

# -------------------- Stage 2: 运行 --------------------
FROM node:20-alpine AS runner

WORKDIR /app

# 复制构建产物
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json* ./
COPY --from=builder /app/apps/asset-service/dist ./apps/asset-service/dist
COPY --from=builder /app/libs/common/dist ./libs/common/dist
COPY --from=builder /app/libs/database/dist ./libs/database/dist
COPY --from=builder /app/libs/oss/dist ./libs/oss/dist

# 仅安装生产依赖
RUN npm ci --omit=dev || npm install --omit=dev

ENV NODE_ENV=production
ENV PORT=3003

EXPOSE 3003

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3003/api/v1/assets/health || exit 1

CMD ["node", "apps/asset-service/dist/main.js"]
