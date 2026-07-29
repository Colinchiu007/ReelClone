# ============================================================
# ReelClone Auth Service Dockerfile
# 多阶段构建：编译 → 运行
# ============================================================

# -------------------- Build Stage --------------------
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 workspace 配置与依赖清单
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY nx.json ./

# 复用已有的 libs 与新建的 auth-service 源码
COPY libs ./libs
COPY apps/auth-service ./apps/auth-service

# 安装依赖（含 peer 依赖冲突时使用 legacy-peer-deps）
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# 编译 auth-service
RUN npx tsc -p apps/auth-service/tsconfig.json

# -------------------- Production Stage --------------------
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# 拷贝运行时所需的 node_modules、编译产物与源码（便于 ts-node 回退）
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/auth-service/dist ./dist
COPY --from=builder /app/package.json ./package.json

EXPOSE 3001

# 健康检查（可选，端点由 NestJS 实现）
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/v1/auth/health || exit 1

CMD ["node", "dist/apps/auth-service/src/main.js"]
