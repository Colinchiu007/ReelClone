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

# 安装依赖（path aliases 会将 @reelclone/* 解析到 libs 源码，tsc 内联编译）
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# 构建 asset-service（libs 通过 path aliases 内联编译到 dist）
RUN npx nx build asset-service || npx tsc -p apps/asset-service/tsconfig.json

# -------------------- Stage 2: 运行 --------------------
FROM node:20-alpine AS runner

WORKDIR /app

# 复制 node_modules + 编译产物（builder 已安装所有依赖，runner 无需重新安装）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/asset-service/dist ./apps/asset-service/dist
COPY --from=builder /app/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=3003

EXPOSE 3003

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3003/api/v1/assets/health || exit 1

CMD ["node", "apps/asset-service/dist/main.js"]
