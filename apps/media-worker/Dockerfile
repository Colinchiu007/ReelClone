# ============================================================
# ReelClone Media Worker Dockerfile
# 多阶段构建：编译 → 运行
# 该服务为 Temporal Worker 长跑进程，仅暴露 /health 健康检查端点
# ============================================================

# -------------------- Build Stage --------------------
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 workspace 配置与依赖清单
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY nx.json ./

# 复用已有的 libs 与新建的 media-worker 源码
COPY libs ./libs
COPY apps/media-worker ./apps/media-worker

# 安装依赖（含 peer 依赖冲突时使用 legacy-peer-deps）
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# 编译 media-worker
RUN npx tsc -p apps/media-worker/tsconfig.json

# -------------------- Production Stage --------------------
FROM node:20-alpine AS production

WORKDIR /app

ENV NODE_ENV=production

# 拷贝运行时所需的 node_modules、编译产物与源码
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/media-worker/dist ./dist
COPY --from=builder /app/package.json ./package.json

# 健康检查端口（仅 /health 端点，无业务 API）
EXPOSE 3010

# 健康检查（K8s liveness/readiness 探针）
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://localhost:3010/health || exit 1

# 启动 Worker（长跑进程）
CMD ["node", "dist/apps/media-worker/src/main.js"]
