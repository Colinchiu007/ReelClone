#!/usr/bin/env bash
# ============================================================
# ReelClone 本地开发环境引导脚本（Shell 备份版本）
# ============================================================
# 当 Task 1（Nx Monorepo 初始化）尚未完成、根目录缺少 package.json
# 无法使用 `npm run bootstrap` 时，可直接运行本脚本：
#
#   bash scripts/bootstrap.sh      (Git Bash / WSL / macOS / Linux)
#   sh scripts/bootstrap.sh
#
# 功能：
#   1. 启动 docker compose up -d
#   2. 等待 PostgreSQL 健康检查通过（最多 30 秒）
#   3. 等待 Redis 健康检查通过
#   4. 输出后续步骤提示
# ============================================================

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
PURPLE='\033[0;35m'
NC='\033[0m' # No Color

# 路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/docker"

# 配置
POSTGRES_CONTAINER="reelclone-postgres"
REDIS_CONTAINER="reelclone-redis"
POSTGRES_TIMEOUT=30
REDIS_TIMEOUT=30

# ============================================================
# 工具函数
# ============================================================
info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
step()  { echo -e "${PURPLE}[STEP]${NC}  $1"; }

# 检查 Docker 是否可用
check_docker() {
    if ! command -v docker &> /dev/null; then
        error "未检测到 Docker，请先安装 Docker Desktop。"
        error "下载地址: https://www.docker.com/products/docker-desktop"
        exit 1
    fi

    if ! docker compose version &> /dev/null; then
        error "未检测到 docker compose 插件，请升级 Docker 版本。"
        exit 1
    fi

    ok "Docker 已就绪: $(docker --version)"
}

# 获取容器健康状态
get_health_status() {
    local container=$1
    docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || echo "none"
}

# 等待容器健康
wait_for_healthy() {
    local container=$1
    local timeout=$2
    local elapsed=0
    local status="none"

    while [ $elapsed -lt $timeout ]; do
        status=$(get_health_status "$container")

        if [ "$status" = "healthy" ]; then
            ok "$container 健康检查通过（耗时 ${elapsed}s）"
            return 0
        fi

        if [ "$status" = "none" ]; then
            warn "$container 未找到健康检查信息，可能容器未启动"
            return 1
        fi

        printf "."
        sleep 1
        elapsed=$((elapsed + 1))
    done

    echo ""
    error "$container 在 ${timeout}s 内未通过健康检查（最后状态: $status）"
    return 1
}

# 启动 Docker Compose
start_compose() {
    step "启动 Docker Compose（目录: $DOCKER_DIR）"
    if ! docker compose -f "$DOCKER_DIR/docker-compose.yml" up -d; then
        error "docker compose up -d 失败"
        exit 1
    fi
    ok "Docker Compose 已启动"
}

# 验证 PostgreSQL 数据库
verify_postgres() {
    step "验证 PostgreSQL 4 个业务数据库可连接"

    local databases=("reelclone_main" "reelclone_billing" "reelclone_template" "reelclone_benchmark")
    local all_ok=true

    for db in "${databases[@]}"; do
        if docker exec "$POSTGRES_CONTAINER" psql -U reelclone -d "$db" -c "SELECT 1;" -t &> /dev/null; then
            ok "  ✓ $db"
        else
            error "  ✗ $db 连接失败"
            all_ok=false
        fi
    done

    if [ "$all_ok" = false ]; then
        return 1
    fi
    return 0
}

# 验证 Redis
verify_redis() {
    step "验证 Redis 可连接"

    local result
    result=$(docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null)
    if [ "$result" = "PONG" ]; then
        ok "Redis PING -> PONG"
        return 0
    fi

    error "Redis ping 失败: $result"
    return 1
}

# 输出后续步骤
print_next_steps() {
    echo ""
    echo "┌──────────────────────────────────────────────────────────────┐"
    echo "│                                                              │"
    echo "│  ✅ 本地环境启动完成                                          │"
    echo "│                                                              │"
    echo "│  服务端口:                                                    │"
    echo "│    • PostgreSQL:  localhost:5432                              │"
    echo "│    • Redis:        localhost:6379                              │"
    echo "│    • Temporal:     localhost:7233                              │"
    echo "│                                                              │"
    echo "│  数据库连接串:                                                │"
    echo "│    postgresql://reelclone:reelclone_dev@localhost:5432/<db>   │"
    echo "│                                                              │"
    echo "│  下一步:                                                      │"
    echo "│    1. npm install                                             │"
    echo "│    2. npm run migration:run                                    │"
    echo "│                                                              │"
    echo "└──────────────────────────────────────────────────────────────┘"
    echo ""
}

# ============================================================
# 主流程
# ============================================================
echo ""
echo "🔧 ReelClone 本地开发环境引导"
echo "============================================================"
echo ""

check_docker
echo ""

start_compose
echo ""

step "等待 PostgreSQL 健康检查通过（最多 ${POSTGRES_TIMEOUT}s）"
if ! wait_for_healthy "$POSTGRES_CONTAINER" "$POSTGRES_TIMEOUT"; then
    error "PostgreSQL 启动失败，请检查日志: docker logs $POSTGRES_CONTAINER"
    exit 1
fi
echo ""

step "等待 Redis 健康检查通过（最多 ${REDIS_TIMEOUT}s）"
if ! wait_for_healthy "$REDIS_CONTAINER" "$REDIS_TIMEOUT"; then
    error "Redis 启动失败，请检查日志: docker logs $REDIS_CONTAINER"
    exit 1
fi
echo ""

if ! verify_postgres; then
    error "PostgreSQL 数据库验证失败"
    exit 1
fi
echo ""

if ! verify_redis; then
    error "Redis 验证失败"
    exit 1
fi
echo ""

print_next_steps
