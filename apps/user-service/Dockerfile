# ============================================================
# ReelClone user-service Dockerfile
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

# 构建 user-service（libs 通过 path aliases 内联编译到 dist）
RUN npx nx build user-service || npx tsc -p apps/user-service/tsconfig.json

# -------------------- Stage 2: 运行 --------------------
FROM node:20-alpine AS runner

WORKDIR /app

# 复制构建产物（libs 已内联编译到 service dist）
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/package-lock.json* ./
COPY --from=builder /app/apps/user-service/dist ./apps/user-service/dist

# 仅安装生产依赖
RUN npm ci --omit=dev --legacy-peer-deps || npm install --omit=dev

ENV NODE_ENV=production
ENV PORT=3002

EXPOSE 3002

# 健康检查
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget --quiet --tries=1 --spider http://localhost:3002/api/v1/health || exit 1

CMD ["node", "apps/user-service/dist/main.js"]
