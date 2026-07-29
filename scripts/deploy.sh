#!/usr/bin/env bash
# ============================================================
# ReelClone 一键生产部署脚本
# ============================================================
# 功能：
#   1. 检查 .env.production 是否存在
#   2. 拉取最新代码（git pull）
#   3. 构建所有 Docker 镜像
#   4. 运行数据库迁移
#   5. 启动所有服务
#   6. 等待健康检查通过
#   7. 输出部署状态
#
# 使用方式：
#   bash scripts/deploy.sh             # 全量部署
#   bash scripts/deploy.sh --no-pull   # 跳过 git pull
#   bash scripts/deploy.sh --no-build  # 跳过镜像构建
#
# 退出码：
#   0 - 部署成功
#   1 - 部署失败（参数错误 / 环境缺失）
#   2 - 构建失败
#   3 - 迁移失败
#   4 - 健康检查未通过
# ============================================================

set -euo pipefail

# ============================================================
# 颜色与工具函数
# ============================================================
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;36m'
PURPLE='\033[0;35m'
NC='\033[0m'

info()  { echo -e "${BLUE}[INFO]${NC}  $1"; }
ok()    { echo -e "${GREEN}[OK]${NC}    $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; }
step()  { echo -e "${PURPLE}[STEP]${NC}  $1"; }
die()   { error "$1"; exit "${2:-1}"; }

# ============================================================
# 路径配置
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DOCKER_DIR="$PROJECT_ROOT/docker"
ENV_FILE="$DOCKER_DIR/.env.production"
COMPOSE_FILE="$DOCKER_DIR/docker-compose.prod.yml"
COMPOSE_CMD="docker compose -f $COMPOSE_FILE --env-file $ENV_FILE"

# 部署参数
DO_PULL=true
DO_BUILD=true
HEALTH_TIMEOUT=300  # 健康检查总超时（秒）

# 业务服务列表（用于健康检查）
SERVICES=(
    "auth-service:3001"
    "user-service:3002"
    "asset-service:3003"
    "benchmark-service:3004"
    "template-service:3005"
    "billing-service:3006"
    "workbench-service:3007"
    "notification-service:3008"
    "order-service:3009"
)

# ============================================================
# 参数解析
# ============================================================
parse_args() {
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --no-pull)
                DO_PULL=false
                shift
                ;;
            --no-build)
                DO_BUILD=false
                shift
                ;;
            --help|-h)
                echo "用法: bash scripts/deploy.sh [--no-pull] [--no-build]"
                echo ""
                echo "选项:"
                echo "  --no-pull    跳过 git pull"
                echo "  --no-build   跳过镜像构建"
                echo "  --help       显示帮助"
                exit 0
                ;;
            *)
                die "未知参数: $1（使用 --help 查看帮助）" 1
                ;;
        esac
    done
}

# ============================================================
# 前置检查
# ============================================================
check_prerequisites() {
    step "前置环境检查"

    # Docker
    if ! command -v docker &> /dev/null; then
        die "未检测到 Docker，请先安装 Docker Engine。" 1
    fi
    if ! docker compose version &> /dev/null; then
        die "未检测到 docker compose 插件，请升级 Docker 版本。" 1
    fi
    ok "Docker 已就绪: $(docker --version)"

    # Git
    if ! command -v git &> /dev/null; then
        warn "未检测到 git，跳过代码拉取步骤"
        DO_PULL=false
    fi

    # .env.production
    if [[ ! -f "$ENV_FILE" ]]; then
        echo ""
        error "未找到生产环境配置文件: $ENV_FILE"
        echo ""
        echo "请先创建配置文件:"
        echo ""
        echo "  cd $DOCKER_DIR"
        echo "  cp .env.production.example .env.production"
        echo "  vim .env.production    # 填写真实凭证"
        echo ""
        die "缺少 .env.production" 1
    fi

    # 检查关键变量是否仍为占位符
    if grep -q "CHANGE_ME" "$ENV_FILE"; then
        warn "检测到 .env.production 中存在未替换的占位符（CHANGE_ME_*）"
        warn "请确认所有凭证已填写真实值后继续"
        read -p "继续部署? [y/N] " -n 1 -r
        echo ""
        [[ ! $REPLY =~ ^[Yy]$ ]] && die "部署已取消" 1
    fi

    ok "配置文件 .env.production 已就绪"
}

# ============================================================
# 拉取最新代码
# ============================================================
pull_latest_code() {
    if [[ "$DO_PULL" != "true" ]]; then
        info "跳过 git pull（--no-pull）"
        return 0
    fi

    step "拉取最新代码"
    cd "$PROJECT_ROOT"

    local branch
    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    info "当前分支: $branch"

    if ! git pull --ff-only; then
        warn "git pull 失败，可能存在本地变更或需要 rebase"
        warn "请手动解决冲突后重新运行"
        read -p "继续部署（使用本地代码）? [y/N] " -n 1 -r
        echo ""
        [[ ! $REPLY =~ ^[Yy]$ ]] && die "部署已取消" 1
    fi

    local commit
    commit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    ok "代码已更新至提交: $commit"
}

# ============================================================
# 构建所有 Docker 镜像
# ============================================================
build_images() {
    if [[ "$DO_BUILD" != "true" ]]; then
        info "跳过镜像构建（--no-build）"
        return 0
    fi

    step "构建所有 Docker 镜像"

    if ! $COMPOSE_CMD build --parallel; then
        die "镜像构建失败，请检查日志" 2
    fi

    ok "所有镜像构建完成"
}

# ============================================================
# 运行数据库迁移
# ============================================================
run_migrations() {
    step "运行数据库迁移"

    # 先确保 postgres 已启动
    if ! $COMPOSE_CMD up -d postgres redis; then
        die "启动 postgres/redis 失败" 1
    fi

    # 等待 postgres 就绪
    info "等待 PostgreSQL 就绪..."
    local elapsed=0
    while [[ $elapsed -lt 60 ]]; do
        if $COMPOSE_CMD exec -T postgres pg_isready -U "$($COMPOSE_CMD exec -T postgres printenv POSTGRES_USER)" &>/dev/null; then
            ok "PostgreSQL 已就绪"
            break
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    if [[ $elapsed -ge 60 ]]; then
        die "PostgreSQL 在 60s 内未就绪" 3
    fi

    # 在宿主机执行迁移（需要 Node 环境）
    if command -v npx &> /dev/null; then
        info "执行迁移: npm run migration:run"
        cd "$PROJECT_ROOT"
        if ! npx nx run-many --target=migration:run --all --parallel; then
            warn "迁移执行失败或部分失败"
            warn "请检查 libs/database/migrations 目录"
            read -p "继续启动服务? [y/N] " -n 1 -r
            echo ""
            [[ ! $REPLY =~ ^[Yy]$ ]] && die "部署已取消" 3
        fi
        ok "数据库迁移完成"
    else
        warn "未检测到 npx，跳过迁移"
        warn "请手动执行: npm run migration:run"
    fi
}

# ============================================================
# 启动所有服务
# ============================================================
start_services() {
    step "启动所有服务"
    if ! $COMPOSE_CMD up -d; then
        die "服务启动失败" 1
    fi
    ok "所有服务已启动"
}

# ============================================================
# 等待健康检查
# ============================================================
wait_for_health() {
    step "等待所有服务健康检查通过（超时 ${HEALTH_TIMEOUT}s）"

    local elapsed=0
    local failed_services=()

    # 等待 docker compose 标记的所有服务 healthy
    while [[ $elapsed -lt $HEALTH_TIMEOUT ]]; do
        # 获取所有非 nginx 的业务服务状态
        local unhealthy=0
        local service_states
        service_states=$($COMPOSE_CMD ps --format json 2>/dev/null || echo "")

        if [[ -z "$service_states" ]]; then
            sleep 5
            elapsed=$((elapsed + 5))
            continue
        fi

        # 简化：直接检查 nginx 容器是否 healthy（依赖所有上游 healthy）
        local nginx_health
        nginx_health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' reelclone-nginx 2>/dev/null || echo "none")

        if [[ "$nginx_health" == "healthy" ]]; then
            ok "所有服务健康检查通过（耗时 ${elapsed}s）"
            return 0
        fi

        printf "."
        sleep 5
        elapsed=$((elapsed + 5))
    done

    echo ""
    error "健康检查在 ${HEALTH_TIMEOUT}s 内未全部通过"
    echo ""
    info "当前服务状态:"
    $COMPOSE_CMD ps || true
    echo ""
    info "未通过健康检查的服务日志:"
    for svc_info in "${SERVICES[@]}"; do
        local svc="${svc_info%%:*}"
        local port="${svc_info##*:}"
        local health
        health=$(docker inspect --format='{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "reelclone-$svc" 2>/dev/null || echo "none")
        if [[ "$health" != "healthy" ]]; then
            error "  ✗ $svc (:$port) -> $health"
            failed_services+=("$svc")
        fi
    done

    if [[ ${#failed_services[@]} -gt 0 ]]; then
        echo ""
        warn "建议执行: $COMPOSE_CMD logs --tail=100 ${failed_services[*]}"
    fi

    die "健康检查未通过" 4
}

# ============================================================
# 输出部署状态
# ============================================================
print_status() {
    echo ""
    echo "============================================================"
    echo "  ReelClone 部署状态"
    echo "============================================================"
    echo ""

    $COMPOSE_CMD ps --format "table {{.Name}}\t{{.Status}}\t{{.Ports}}" || $COMPOSE_CMD ps

    echo ""
    echo "------------------------------------------------------------"
    echo "  服务端点:"
    echo "------------------------------------------------------------"
    echo "  • HTTPS:        https://\${SERVER_NAME}"
    echo "  • HTTP -> 301:  http://\${SERVER_NAME}"
    echo "  • 健康检查:     https://\${SERVER_NAME}/health"
    echo "  • WebSocket:    wss://\${SERVER_NAME}/ws"
    echo "  • Temporal UI:  http://<内网IP>:8080 (仅内网)"
    echo ""
    echo "------------------------------------------------------------"
    echo "  常用命令:"
    echo "------------------------------------------------------------"
    echo "  • 查看日志:     $COMPOSE_CMD logs -f --tail=100"
    echo "  • 重启服务:     $COMPOSE_CMD restart <service>"
    echo "  • 停止服务:     $COMPOSE_CMD down"
    echo "  • 数据库备份:   bash scripts/backup-db.sh"
    echo "  • 回滚:         bash scripts/rollback.sh"
    echo ""
    echo "============================================================"
}

# ============================================================
# 主流程
# ============================================================
main() {
    echo ""
    echo "🚀 ReelClone 生产环境部署"
    echo "============================================================"
    echo ""

    parse_args "$@"
    check_prerequisites
    echo ""

    pull_latest_code
    echo ""

    build_images
    echo ""

    run_migrations
    echo ""

    start_services
    echo ""

    wait_for_health
    echo ""

    print_status
}

main "$@"
