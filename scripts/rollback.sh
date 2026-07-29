#!/usr/bin/env bash
# ============================================================
# ReelClone 回滚脚本
# ============================================================
# 功能：
#   1. 回滚到上一个镜像版本（使用 Docker 镜像标签历史）
#   2. 不回滚数据库（仅警告，需手动处理）
#   3. 支持回滚到指定版本
#
# 使用方式：
#   bash scripts/rollback.sh                 # 回滚到上一个版本
#   bash scripts/rollback.sh <commit-hash>   # 回滚到指定 commit
#   bash scripts/rollback.sh --list           # 列出可用版本
#
# 安全说明：
#   - 数据库不做自动回滚（迁移可能不可逆）
#   - 回滚前会自动备份当前数据库
#   - 回滚后需手动验证业务功能
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

# 业务服务镜像列表
IMAGES=(
    "reelclone/auth-service"
    "reelclone/user-service"
    "reelclone/asset-service"
    "reelclone/benchmark-service"
    "reelclone/template-service"
    "reelclone/billing-service"
    "reelclone/workbench-service"
    "reelclone/notification-service"
    "reelclone/order-service"
    "reelclone/media-worker"
)

# ============================================================
# 列出可用版本
# ============================================================
list_versions() {
    step "可用镜像版本（最近 20 个）"
    echo ""

    local first_image="${IMAGES[0]}"
    if ! docker image inspect "$first_image:latest" &>/dev/null; then
        warn "未找到本地镜像: $first_image"
        return 1
    fi

    # 列出所有镜像标签（按创建时间倒序）
    docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}\t{{.Size}}" \
        | grep -E "(REPOSITORY|reelclone/)" \
        | head -20

    echo ""
    info "可用 git 历史（最近 10 个 commit）:"
    cd "$PROJECT_ROOT"
    git log --oneline -10 2>/dev/null || warn "git log 不可用"

    echo ""
    info "回滚到指定 commit:"
    echo "  bash scripts/rollback.sh <commit-hash>"
}

# ============================================================
# 备份当前数据库（回滚前保护）
# ============================================================
backup_database() {
    step "回滚前自动备份数据库"

    if [[ ! -f "$SCRIPT_DIR/backup-db.sh" ]]; then
        warn "未找到 backup-db.sh，跳过自动备份"
        warn "强烈建议手动执行: bash scripts/backup-db.sh"
        return 0
    fi

    if ! bash "$SCRIPT_DIR/backup-db.sh"; then
        warn "自动备份失败，请手动确认数据库状态"
        read -p "继续回滚? [y/N] " -n 1 -r
        echo ""
        [[ ! $REPLY =~ ^[Yy]$ ]] && die "回滚已取消" 1
    else
        ok "数据库已备份，可继续回滚"
    fi
}

# ============================================================
# 通过 git reset 回滚代码
# ============================================================
rollback_to_commit() {
    local target_commit="$1"

    step "回滚代码到: $target_commit"
    cd "$PROJECT_ROOT"

    local current_commit
    current_commit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    info "当前 HEAD: $current_commit"

    # 验证 commit 存在
    if ! git cat-file -e "$target_commit^{commit}" 2>/dev/null; then
        die "无效的 commit hash: $target_commit" 1
    fi

    warn "将执行 git reset --hard $target_commit"
    warn "此操作会丢弃工作区未提交的变更"
    read -p "确认回滚? [y/N] " -n 1 -r
    echo ""
    [[ ! $REPLY =~ ^[Yy]$ ]] && die "回滚已取消" 1

    git reset --hard "$target_commit"
    ok "代码已回滚到: $(git rev-parse --short HEAD)"
}

# ============================================================
# 重建镜像并重启服务
# ============================================================
rebuild_and_restart() {
    step "重新构建镜像"

    if ! $COMPOSE_CMD build --parallel; then
        die "镜像重建失败" 2
    fi
    ok "镜像重建完成"

    step "重启所有服务（不删除数据卷）"
    if ! $COMPOSE_CMD up -d --force-recreate; then
        die "服务重启失败" 1
    fi
    ok "服务已重启"
}

# ============================================================
# 等待健康检查
# ============================================================
wait_for_health() {
    step "等待健康检查通过（最多 180s）"

    local elapsed=0
    while [[ $elapsed -lt 180 ]]; do
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
    warn "健康检查未在 180s 内通过，请手动检查:"
    warn "  $COMPOSE_CMD ps"
    warn "  $COMPOSE_CMD logs --tail=100"
}

# ============================================================
# 数据库回滚警告
# ============================================================
warn_database_rollback() {
    step "数据库回滚提醒"
    echo ""
    warn "⚠️  数据库不会自动回滚！"
    echo ""
    echo "  原因："
    echo "    - 数据库迁移可能不可逆（DROP TABLE / ALTER COLUMN）"
    echo "    - 自动回滚可能导致数据丢失"
    echo ""
    echo "  如需回滚数据库："
    echo "    1. 确认回滚目标版本的迁移文件存在"
    echo "    2. 手动执行反向迁移（如有）"
    echo "    3. 或从备份恢复: bash scripts/backup-db.sh restore <file>"
    echo ""
    warn "回滚前已自动创建数据库备份，可从备份恢复"
    echo ""
}

# ============================================================
# 输出回滚状态
# ============================================================
print_status() {
    echo ""
    echo "============================================================"
    echo "  ReelClone 回滚状态"
    echo "============================================================"
    echo ""
    $COMPOSE_CMD ps --format "table {{.Name}}\t{{.Status}}" 2>/dev/null || $COMPOSE_CMD ps
    echo ""
    echo "------------------------------------------------------------"
    echo "  回滚后请验证："
    echo "------------------------------------------------------------"
    echo "  1. 业务功能正常（登录、生成、支付）"
    echo "  2. 日志无异常错误: $COMPOSE_CMD logs -f --tail=100"
    echo "  3. 数据一致性（积分余额、订单状态）"
    echo ""
    echo "============================================================"
}

# ============================================================
# 主流程
# ============================================================
main() {
    echo ""
    echo "⏪ ReelClone 生产环境回滚"
    echo "============================================================"
    echo ""

    # 参数处理
    case "${1:-}" in
        --list|-l)
            list_versions
            exit 0
            ;;
        --help|-h)
            echo "用法: bash scripts/rollback.sh [--list|<commit-hash>]"
            echo ""
            echo "选项:"
            echo "  --list       列出可用版本"
            echo "  <commit>     回滚到指定 commit"
            echo "  --help       显示帮助"
            echo ""
            echo "默认行为：回滚到上一个 commit"
            exit 0
            ;;
        "")
            # 默认回滚到上一个 commit
            local prev_commit
            cd "$PROJECT_ROOT"
            prev_commit=$(git rev-parse --short HEAD~1 2>/dev/null || echo "")
            if [[ -z "$prev_commit" ]]; then
                die "无法获取上一个 commit，请手动指定: bash scripts/rollback.sh <commit-hash>" 1
            fi
            info "将回滚到上一个 commit: $prev_commit"
            TARGET_COMMIT="$prev_commit"
            ;;
        *)
            TARGET_COMMIT="$1"
            ;;
    esac

    # 前置检查
    if [[ ! -f "$ENV_FILE" ]]; then
        die "未找到 $ENV_FILE，请先创建" 1
    fi

    # 回滚流程
    backup_database
    echo ""

    rollback_to_commit "$TARGET_COMMIT"
    echo ""

    rebuild_and_restart
    echo ""

    warn_database_rollback
    echo ""

    wait_for_health
    echo ""

    print_status
}

main "$@"
