# ============================================================
# notification-service Dockerfile
# 多阶段构建：
#   1. builder:  安装依赖 + 编译 TypeScript
#   2. runner:   仅拷贝 dist + 生产依赖，镜像体积更小
# ============================================================

# -------------------- Stage 1: builder --------------------
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 workspace 根文件（package.json / package-lock.json / tsconfig）
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY nx.json ./

# 复制 libs（notification-service 依赖 @reelclone/common / @reelclone/database）
COPY libs ./libs

# 复制 notification-service 自身
COPY apps/notification-service ./apps/notification-service

# 安装所有依赖（包括 dev）
RUN npm ci --workspace=@reelclone/notification-service --include-workspace-root || npm install

# 编译 notification-service
RUN npx tsc -p apps/notification-service/tsconfig.json

# -------------------- Stage 2: runner --------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# 复制 package 元信息
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./

# 复制 libs 源码（运行时通过 workspace 软链接引用）
COPY libs ./libs

# 复制编译产物
COPY --from=builder /app/apps/notification-service/dist ./apps/notification-service/dist

# 仅安装生产依赖
RUN npm ci --omit-dev --workspace=@reelclone/notification-service --include-workspace-root || npm install --omit-dev

# 暴露端口
EXPOSE 3008

# 健康检查（HTTP 接口可由反向代理探活）
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3008/api/v1/notifications/unread-count || exit 1

# 启动
CMD ["node", "apps/notification-service/dist/main.js"]
