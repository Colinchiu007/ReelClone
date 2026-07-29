#!/usr/bin/env bash
# ============================================================
# ReelClone 数据库备份脚本
# ============================================================
# 功能：
#   1. pg_dump 备份 4 个业务数据库到 backup 目录
#   2. 保留最近 7 天的备份（自动清理过期文件）
#   3. gzip 压缩存储，节省磁盘空间
#   4. 支持从备份恢复
#
# 使用方式：
#   bash scripts/backup-db.sh                   # 执行备份
#   bash scripts/backup-db.sh restore <file>    # 从备份恢复
#   bash scripts/backup-db.sh list              # 列出可用备份
#
# 备份目录：docker/backups/
# 备份格式：reelclone_<db>_<YYYYMMDD_HHMMSS>.sql.gz
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

# 备份目录（与 docker-compose.prod.yml 挂载一致）
BACKUP_DIR="$DOCKER_DIR/backups"
RETENTION_DAYS=7

# PostgreSQL 容器名
PG_CONTAINER="reelclone-postgres"

# 4 个业务数据库
DATABASES=(
    "reelclone_main"
    "reelclone_billing"
    "reelclone_template"
    "reelclone_benchmark"
)

# ============================================================
# 读取环境变量
# ============================================================
load_env() {
    if [[ ! -f "$ENV_FILE" ]]; then
        die "未找到 $ENV_FILE，请先创建" 1
    fi

    # 安全加载 .env.production 中的变量
    set -a
    # shellcheck disable=SC1090
    source <(grep -E '^[A-Z_]+=' "$ENV_FILE" | grep -v 'PRIVATE_KEY' || true)
    set +a

    PG_USER="${DATABASE_USER:-reelclone}"
    PG_HOST="${DATABASE_HOST:-postgres}"

    if [[ -z "${DATABASE_PASSWORD:-}" ]]; then
        die "DATABASE_PASSWORD 未设置或为空" 1
    fi
}

# ============================================================
# 确保容器与目录就绪
# ============================================================
ensure_ready() {
    # 创建备份目录
    mkdir -p "$BACKUP_DIR"

    # 检查 postgres 容器是否运行
    if ! docker ps --format '{{.Names}}' | grep -q "^${PG_CONTAINER}$"; then
        die "PostgreSQL 容器未运行: $PG_CONTAINER" 1
    fi

    ok "PostgreSQL 容器运行中"
}

# ============================================================
# 执行备份
# ============================================================
do_backup() {
    local timestamp
    timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_subdir="$BACKUP_DIR/$timestamp"

    mkdir -p "$backup_subdir"

    step "开始备份 4 个数据库到: $backup_subdir"
    echo ""

    local all_ok=true
    local backed_up=()

    for db in "${DATABASES[@]}"; do
        local file="$backup_subdir/reelclone_${db}_${timestamp}.sql.gz"
        info "备份 $db ..."

        # 使用 pg_dump + gzip 压缩
        if docker exec "$PG_CONTAINER" \
            pg_dump -U "$PG_USER" -d "$db" --no-owner --no-acl \
            | gzip > "$file"; then

            local size
            size=$(du -h "$file" | cut -f1)
            ok "  ✓ $db -> reelclone_${db}_${timestamp}.sql.gz ($size)"
            backed_up+=("$file")
        else
            error "  ✗ $db 备份失败"
            all_ok=false
        fi
    done

    echo ""

    if [[ "$all_ok" != "true" ]]; then
        error "部分数据库备份失败"
        return 1
    fi

    # 创建清单文件
    local manifest="$backup_subdir/MANIFEST.txt"
    {
        echo "ReelClone 数据库备份清单"
        echo "时间: $(date)"
        echo "时间戳: $timestamp"
        echo "数据库:"
        for db in "${DATABASES[@]}"; do
            echo "  - $db"
        done
        echo "文件:"
        for f in "${backed_up[@]}"; do
            echo "  - $(basename "$f")"
        done
    } > "$manifest"

    ok "备份完成"
    echo ""
    info "备份目录: $backup_subdir"
    info "清单文件: $manifest"

    # 清理过期备份
    cleanup_old_backups
}

# ============================================================
# 清理过期备份（保留最近 N 天）
# ============================================================
cleanup_old_backups() {
    step "清理 ${RETENTION_DAYS} 天前的过期备份"

    local deleted=0
    local kept=0

    # 遍历备份子目录
    for dir in "$BACKUP_DIR"/*/; do
        [[ -d "$dir" ]] || continue
        local dirname
        dirname=$(basename "$dir")

        # 解析目录名中的时间戳（YYYYMMDD_HHMMSS）
        if [[ ! "$dirname" =~ ^[0-9]{8}_[0-9]{6}$ ]]; then
            continue
        fi

        local dir_date="${dirname:0:8}"
        local cutoff_date
        cutoff_date=$(date -d "$RETENTION_DAYS days ago" +"%Y%m%d" 2>/dev/null || \
                     date -v-${RETENTION_DAYS}d +"%Y%m%d" 2>/dev/null || \
                     echo "")

        if [[ -z "$cutoff_date" ]]; then
            warn "无法计算截止日期，跳过清理"
            return 0
        fi

        if [[ "$dir_date" < "$cutoff_date" ]]; then
            rm -rf "$dir"
            info "  删除过期备份: $dirname"
            deleted=$((deleted + 1))
        else
            kept=$((kept + 1))
        fi
    done

    ok "清理完成: 删除 $deleted 个，保留 $kept 个备份"
}

# ============================================================
# 列出可用备份
# ============================================================
list_backups() {
    step "可用备份列表"
    echo ""

    if [[ ! -d "$BACKUP_DIR" ]] || [[ -z "$(ls -A "$BACKUP_DIR" 2>/dev/null)" ]]; then
        warn "暂无备份"
        return 0
    fi

    printf "%-20s %-10s %-20s %s\n" "时间戳" "大小" "数据库" "状态"
    printf "%-20s %-10s %-20s %s\n" "----" "----" "----" "----"

    for dir in "$BACKUP_DIR"/*/; do
        [[ -d "$dir" ]] || continue
        local dirname
        dirname=$(basename "$dir")

        if [[ ! "$dirname" =~ ^[0-9]{8}_[0-9]{6}$ ]]; then
            continue
        fi

        local size
        size=$(du -sh "$dir" 2>/dev/null | cut -f1)
        local db_count
        db_count=$(find "$dir" -name "*.sql.gz" | wc -l | tr -d ' ')

        local status="完整"
        if [[ "$db_count" -lt "${#DATABASES[@]}" ]]; then
            status="不完整 ($db_count/${#DATABASES[@]})"
        fi

        printf "%-20s %-10s %-20s %s\n" "$dirname" "$size" "$db_count/${#DATABASES[@]}" "$status"
    done

    echo ""
    info "恢复命令: bash scripts/backup-db.sh restore <timestamp>"
}

# ============================================================
# 从备份恢复
# ============================================================
restore_backup() {
    local timestamp="${1:-}"

    if [[ -z "$timestamp" ]]; then
        die "请指定备份时间戳，例如: bash scripts/backup-db.sh restore 20250729_120000" 1
    fi

    local backup_subdir="$BACKUP_DIR/$timestamp"

    if [[ ! -d "$backup_subdir" ]]; then
        die "备份目录不存在: $backup_subdir" 1
    fi

    step "从备份恢复: $timestamp"
    echo ""
    warn "⚠️  此操作将覆盖当前数据库！"
    warn "  恢复前请确保所有服务已停止或不在写入数据"
    echo ""
    read -p "确认恢复? [y/N] " -n 1 -r
    echo ""
    [[ ! $REPLY =~ ^[Yy]$ ]] && die "恢复已取消" 1

    echo ""

    local all_ok=true

    for db in "${DATABASES[@]}"; do
        local file="$backup_subdir/reelclone_${db}_${timestamp}.sql.gz"

        if [[ ! -f "$file" ]]; then
            error "备份文件不存在: $file"
            all_ok=false
            continue
        fi

        info "恢复 $db ..."

        # 先断开所有连接，然后 drop + recreate + restore
        docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -c \
            "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='$db';" \
            >/dev/null 2>&1 || true

        docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -c \
            "DROP DATABASE IF EXISTS $db;" >/dev/null 2>&1 || true

        docker exec "$PG_CONTAINER" psql -U "$PG_USER" -d postgres -c \
            "CREATE DATABASE $db OWNER $PG_USER;" >/dev/null 2>&1 || true

        # 解压并恢复
        if gunzip -c "$file" | docker exec -i "$PG_CONTAINER" \
            psql -U "$PG_USER" -d "$db" --quiet; then
            ok "  ✓ $db 恢复成功"
        else
            error "  ✗ $db 恢复失败"
            all_ok=false
        fi
    done

    echo ""

    if [[ "$all_ok" != "true" ]]; then
        die "部分数据库恢复失败，请检查日志" 1
    fi

    ok "数据库恢复完成"
    echo ""
    warn "请重启所有服务: bash scripts/deploy.sh --no-build"
}

# ============================================================
# 主流程
# ============================================================
main() {
    echo ""
    echo "💾 ReelClone 数据库备份工具"
    echo "============================================================"
    echo ""

    load_env
    ensure_ready
    echo ""

    case "${1:-backup}" in
        backup|"")
            do_backup
            ;;
        restore)
            restore_backup "${2:-}"
            ;;
        list|ls|-l)
            list_backups
            ;;
        --help|-h)
            echo "用法: bash scripts/backup-db.sh [backup|restore <ts>|list]"
            echo ""
            echo "命令:"
            echo "  backup               执行备份（默认）"
            echo "  restore <timestamp>  从备份恢复"
            echo "  list                 列出可用备份"
            echo "  --help               显示帮助"
            echo ""
            echo "备份目录: $BACKUP_DIR"
            echo "保留天数: $RETENTION_DAYS 天"
            exit 0
            ;;
        *)
            die "未知命令: $1（使用 --help 查看帮助）" 1
            ;;
    esac

    echo ""
    echo "============================================================"
}

main "$@"
