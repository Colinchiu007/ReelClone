# ============================================================
# ReelClone workbench-service Dockerfile
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
COPY apps/workbench-service ./apps/workbench-service

# 安装依赖（包含 workspace 链接）
RUN npm ci --workspace=@reelclone/workbench-service --workspace=@reelclone/common --workspace=@reelclone/database --workspace=@reelclone/temporal --workspace=@reelclone/ai --include-workspace-root || npm install

# 编译 workbench-service
RUN npx tsc -p apps/workbench-service/tsconfig.json

# -------------------- Stage 2: prod --------------------
FROM node:20-alpine AS prod

WORKDIR /app

ENV NODE_ENV=production

# 复制 package.json 与已编译产物
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/apps/workbench-service/dist ./apps/workbench-service/dist
COPY --from=builder /app/libs/common/dist ./libs/common/dist
COPY --from=builder /app/libs/database/dist ./libs/database/dist
COPY --from=builder /app/libs/temporal/dist ./libs/temporal/dist
COPY --from=builder /app/libs/ai/dist ./libs/ai/dist
COPY --from=builder /app/node_modules ./node_modules

EXPOSE 3007

CMD ["node", "apps/workbench-service/dist/main.js"]
