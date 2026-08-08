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

# 安装依赖（path aliases 会将 @reelclone/* 解析到 libs 源码，tsc 内联编译）
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# 编译 notification-service（libs 通过 path aliases 内联编译到 dist）
RUN npx tsc -p apps/notification-service/tsconfig.json

# -------------------- Stage 2: runner --------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3008

# 复制编译产物（libs 已内联编译到 service dist）
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/notification-service/dist ./apps/notification-service/dist
COPY --from=builder /app/node_modules ./node_modules

# 暴露端口
EXPOSE 3008

# 健康检查（HTTP 接口可由反向代理探活）
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3008/api/v1/notifications/unread-count || exit 1

# 启动
CMD ["node", "apps/notification-service/dist/main.js"]
