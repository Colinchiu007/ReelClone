# ============================================================
# ReelClone order-service Dockerfile
# 多阶段构建：build -> prod
# ============================================================

# -------------------- Stage 1: build --------------------
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 workspace 配置和依赖清单
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY nx.json ./
COPY libs ./libs
COPY apps/order-service ./apps/order-service

# 安装依赖（path aliases 会将 @reelclone/* 解析到 libs 源码，tsc 内联编译）
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# 编译 order-service（libs 通过 path aliases 内联编译到 dist）
RUN npx tsc -p apps/order-service/tsconfig.json

# -------------------- Stage 2: prod --------------------
FROM node:20-alpine AS prod

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3009

# 复制 package.json 与已编译产物（libs 已内联编译到 service dist）
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/order-service/dist ./apps/order-service/dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3009

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3009/health || exit 1

CMD ["node", "apps/order-service/dist/main.js"]
