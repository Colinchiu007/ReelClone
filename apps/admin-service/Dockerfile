# ============================================================
# ReelClone admin-service Dockerfile
# 微信云托管适配：
#   - 多阶段构建（builder 编译 + runner 运行）
#   - 无 HEALTHCHECK（云托管自动接管健康检查）
#   - npm prune --production 移除开发依赖，控制镜像体积
#   - CMD 统一为 apps/admin-service/dist/main.js（扁平编译产物）
# 前置：根 package.json 提供 build:libs（按拓扑预编译共享库）。
# 共享库通过 node_modules workspaces 软链解析到 libs/*/dist。
# ============================================================

# -------------------- Stage 1: 构建 --------------------
FROM node:20-alpine AS builder

WORKDIR /app

# 复制 workspace 根配置与构建脚本
COPY package.json package-lock.json* ./
COPY tsconfig.base.json ./
COPY nx.json ./
COPY scripts/ ./scripts/

# 复制 workspace 源码
#   - libs 需完整复制以支持 @reelclone/* 解析
#   - apps 需完整复制以满足 npm workspaces 声明（apps/*）
COPY libs/ ./libs/
COPY apps/ ./apps/

# 安装依赖（npm workspaces 自动创建 @reelclone/* 软链）
RUN npm ci --legacy-peer-deps || npm install --legacy-peer-deps

# 按依赖拓扑预编译共享库（paths 空映射 → node_modules 解析 libs/dist）
RUN npm run build:libs

# 编译当前服务（扁平产物 apps/admin-service/dist/main.js）
RUN npx tsc -p apps/admin-service/tsconfig.build.json

# 移除开发依赖，减小运行镜像体积
RUN npm prune --production --legacy-peer-deps

# -------------------- Stage 2: 运行 --------------------
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# node_modules（含 @reelclone/* workspaces 软链）
COPY --from=builder /app/node_modules ./node_modules
# libs 产物（软链目标：node_modules/@reelclone/* -> ../../libs/*）
COPY --from=builder /app/libs ./libs
# 当前服务产物
COPY --from=builder /app/apps/admin-service ./apps/admin-service
# 根 package.json（workspaces 声明，Node 解析依赖）
COPY --from=builder /app/package.json ./package.json

CMD ["node", "apps/admin-service/dist/main.js"]
