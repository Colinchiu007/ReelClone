# ReelClone 生产环境部署指南

本文档描述 ReelClone 项目（9 个后端微服务 + 1 个 Worker + 1 个小程序前端）的生产环境部署流程。

---

## 目录

- [前置条件](#前置条件)
- [快速部署（5 步）](#快速部署5-步)
- [详细配置说明](#详细配置说明)
- [服务架构](#服务架构)
- [监控与日志查看](#监控与日志查看)
- [常见问题排查](#常见问题排查)
- [备份与恢复](#备份与恢复)
- [升级流程](#升级流程)

---

## 前置条件

### 1. 服务器要求

| 资源 | 最低配置 | 推荐配置 |
|------|---------|---------|
| CPU | 4 核 | 8 核 |
| 内存 | 8 GB | 16 GB |
| 磁盘 | 50 GB SSD | 100 GB SSD |
| 操作系统 | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |
| 带宽 | 5 Mbps | 10 Mbps |

### 2. 软件依赖

- **Docker Engine** ≥ 24.0
- **Docker Compose** v2（已内置插件）
- **Git** ≥ 2.30
- **Node.js** ≥ 18（仅迁移需要，可在本地执行）

安装 Docker：

```bash
# Ubuntu 安装 Docker
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
# 重新登录后生效

# 验证
docker --version
docker compose version
```

### 3. 域名与 SSL 证书

- 已备案的域名（如 `api.your-domain.com`）
- SSL 证书（PEM 格式）：
  - `fullchain.pem`：证书链
  - `privkey.pem`：私钥

可通过 Let's Encrypt 免费获取：

```bash
# 安装 certbot
sudo apt install certbot

# 申请证书（DNS 验证方式，不影响服务运行）
sudo certbot certonly --manual --preferred-challenges dns -d api.your-domain.com

# 证书路径：/etc/letsencrypt/live/api.your-domain.com/
# 复制到 docker/nginx/ssl/ 目录
sudo cp /etc/letsencrypt/live/api.your-domain.com/fullchain.pem docker/nginx/ssl/
sudo cp /etc/letsencrypt/live/api.your-domain.com/privkey.pem docker/nginx/ssl/
```

### 4. 外部服务凭证

部署前需准备以下外部服务的真实凭证：

- 微信小程序 AppID + Secret
- 微信支付商户号 + 证书 + API V3 密钥
- 阿里云 OSS AccessKey + Bucket
- 阿里云短信 AccessKey + 签名
- Seedance 视频 AI API Key
- LLM API Key（OpenAI / 其他）

---

## 快速部署（5 步）

### 步骤 1：克隆代码

```bash
git clone https://github.com/your-org/ReelClone.git
cd ReelClone
```

### 步骤 2：配置环境变量

```bash
cd docker
cp .env.production.example .env.production
vim .env.production
```

**关键配置（必须修改）：**

```bash
# 数据库密码（强随机值）
DATABASE_PASSWORD=$(openssl rand -hex 16)
REDIS_PASSWORD=$(openssl rand -hex 16)

# JWT 密钥（至少 32 字符）
JWT_SECRET=$(openssl rand -hex 32)

# 内部 API Key
INTERNAL_API_KEY=$(openssl rand -hex 16)

# 微信凭证
WECHAT_APPID=your_appid
WECHAT_SECRET=your_secret
WECHAT_PAY_MCHID=your_mch_id
# ... 其他真实凭证
```

> **安全提示**：所有 `CHANGE_ME_*` 占位符必须替换为真实强随机值。

### 步骤 3：放置 SSL 证书

```bash
mkdir -p docker/nginx/ssl
cp /path/to/fullchain.pem docker/nginx/ssl/
cp /path/to/privkey.pem  docker/nginx/ssl/
```

### 步骤 4：一键部署

```bash
cd /path/to/ReelClone
bash scripts/deploy.sh
```

部署脚本会自动完成：
1. 前置检查（Docker、配置文件）
2. 拉取最新代码
3. 构建所有 Docker 镜像
4. 运行数据库迁移
5. 启动所有服务
6. 等待健康检查通过
7. 输出部署状态

### 步骤 5：验证部署

```bash
# 健康检查
curl https://api.your-domain.com/health
# 期望输出: {"status":"ok","service":"nginx"}

# 登录接口（Mock 模式下可直接测试）
curl -X POST https://api.your-domain.com/api/v1/auth/wechat-login \
  -H "Content-Type: application/json" \
  -d '{"code":"test_code"}'
```

---

## 详细配置说明

### 目录结构

```
ReelClone/
├── docker/
│   ├── docker-compose.prod.yml    # 生产环境编排
│   ├── docker-compose.yml         # 开发环境编排
│   ├── init-db.sql                # 数据库初始化脚本
│   ├── .env.production.example    # 环境变量模板
│   ├── .env.production            # 实际配置（不提交）
│   ├── backups/                   # 数据库备份目录
│   └── nginx/
│       ├── nginx.conf             # Nginx 主配置
│       ├── conf.d/
│       │   └── proxy-common.conf  # 通用代理头
│       └── ssl/
│           ├── fullchain.pem      # SSL 证书
│           └── privkey.pem        # SSL 私钥
├── scripts/
│   ├── deploy.sh                  # 部署脚本
│   ├── rollback.sh                # 回滚脚本
│   └── backup-db.sh              # 备份脚本
└── docs/
    └── DEPLOYMENT.md              # 本文档
```

### 环境变量详解

#### Mock 模式（生产必须关闭）

生产环境必须将所有 Mock 模式设为 `false`：

| 变量 | 说明 |
|------|------|
| `TEMPORAL_MOCK_MODE=false` | 关闭 Temporal Mock，走真实工作流 |
| `WECHAT_MOCK_MODE=false` | 关闭微信登录 Mock，走真实微信 API |
| `WECHAT_PAY_MOCK_MODE=false` | 关闭微信支付 Mock，走真实支付 |
| `WECHAT_SUBSCRIBE_MOCK_MODE=false` | 关闭微信订阅消息 Mock |
| `SMS_MOCK_MODE=false` | 关闭短信 Mock，走真实短信通道 |
| `OSS_MOCK=false` | 关闭 OSS Mock，走真实对象存储 |

#### 数据库配置

```bash
DATABASE_HOST=postgres           # 容器名（docker 网络内解析）
DATABASE_PORT=5432
DATABASE_USER=reelclone
DATABASE_PASSWORD=strong_pwd     # 必须强随机
DATABASE_NAME=reelclone_main     # 主库
```

4 个业务数据库（由 `init-db.sql` 自动创建）：

- `reelclone_main`：用户 / 资产 / 作品 / 订单 / 通知
- `reelclone_billing`：积分流水 / 账本
- `reelclone_template`：模板 / 推荐
- `reelclone_benchmark`：对标解析

#### Redis 配置

```bash
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=strong_pwd         # 必须设置密码
```

Redis 配置启用：
- AOF 持久化（`appendonly yes`）
- 最大内存 256MB + LRU 淘汰策略
- 密码鉴权

#### 资源限制

每个服务在 `docker-compose.prod.yml` 中配置了资源限制：

| 服务 | 内存上限 | CPU 上限 |
|------|---------|---------|
| postgres | 1 GB | 1.5 核 |
| redis | 384 MB | 0.5 核 |
| temporal | 512 MB | 1.0 核 |
| auth-service | 256 MB | 0.5 核 |
| user-service | 256 MB | 0.5 核 |
| asset-service | 256 MB | 0.5 核 |
| benchmark-service | 256 MB | 0.5 核 |
| template-service | 256 MB | 0.5 核 |
| billing-service | 256 MB | 0.5 核 |
| workbench-service | 384 MB | 0.75 核 |
| notification-service | 256 MB | 0.5 核 |
| order-service | 256 MB | 0.5 核 |
| media-worker | 1 GB | 1.5 核 |
| nginx | 256 MB | 0.5 核 |

**总资源需求**：约 6.5 GB 内存、8.25 核 CPU

#### 日志配置

所有服务统一使用 `json-file` 日志驱动：

```yaml
logging:
  driver: json-file
  options:
    max-size: "10m"    # 单个日志文件最大 10MB
    max-file: "3"      # 保留 3 个日志文件
```

Nginx 访问日志采用 JSON 结构化格式，便于 ELK / Loki 采集。

---

## 服务架构

### 网络拓扑

```
                    ┌─────────────────────────┐
                    │   公网（Internet）       │
                    └────────────┬────────────┘
                                 │ 80 / 443
                    ┌────────────▼────────────┐
                    │   Nginx（SSL 终止）     │
                    │   反向代理 + 限流       │
                    └────────────┬────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            │                    │                    │
   ┌────────▼────────┐  ┌────────▼────────┐  ┌───────▼─────────┐
   │ auth-service    │  │ user-service    │  │ asset-service   │
   │ :3001           │  │ :3002           │  │ :3003           │
   └─────────────────┘  └─────────────────┘  └─────────────────┘
   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
   │ benchmark-svc  │  │ template-svc     │  │ billing-service │
   │ :3004          │  │ :3005           │  │ :3006           │
   └─────────────────┘  └─────────────────┘  └─────────────────┘
   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
   │ workbench-svc   │  │ notification-svc│  │ order-service   │
   │ :3007           │  │ :3008           │  │ :3009           │
   └─────────────────┘  └─────────────────┘  └─────────────────┘
                                 │
                    ┌────────────▼────────────┐
                    │   media-worker          │
                    │   （Temporal Worker）    │
                    └────────────┬────────────┘
                                 │
            ┌────────────────────┼────────────────────┐
            │                    │                    │
   ┌────────▼────────┐  ┌────────▼────────┐  ┌───────▼─────────┐
   │ PostgreSQL 16   │  │ Redis 7         │  │ Temporal Server │
   │ 4 业务库         │  │ 缓存 / Pub-Sub  │  │ 工作流引擎      │
   └─────────────────┘  └─────────────────┘  └─────────────────┘
```

### API 路由

| 路径 | 上游服务 | 端口 |
|------|---------|------|
| `/api/v1/auth/*` | auth-service | 3001 |
| `/api/v1/users/*` | user-service | 3002 |
| `/api/v1/sms/*` | user-service | 3002 |
| `/api/v1/assets/*` | asset-service | 3003 |
| `/api/v1/benchmarks/*` | benchmark-service | 3004 |
| `/api/v1/templates/*` | template-service | 3005 |
| `/api/v1/points/*` | billing-service | 3006 |
| `/api/v1/generations/*` | workbench-service | 3007 |
| `/api/v1/works/*` | workbench-service | 3007 |
| `/api/v1/notifications/*` | notification-service | 3008 |
| `/api/v1/packages/*` | order-service | 3009 |
| `/api/v1/orders/*` | order-service | 3009 |
| `/api/v1/webhooks/*` | order-service | 3009（不限流） |
| `/ws` | notification-service | 3008（WebSocket） |

### 限流策略

| Zone | 限流 | 适用路径 |
|------|------|---------|
| `api_limit` | 10 req/s，突发 20 | 通用 API |
| `auth_limit` | 1 req/s，突发 5 | `/api/v1/auth/login` `/api/v1/auth/refresh` |
| `sms_limit` | 1 req/min，突发 3 | `/api/v1/sms/*` |
| Webhook | 不限流 | `/api/v1/webhooks/*` |

---

## 监控与日志查看

### 查看服务状态

```bash
cd docker
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

输出示例：

```
NAME                           STATUS                   PORTS
reelclone-postgres             Up (healthy)             5432
reelclone-redis                Up (healthy)             6379
reelclone-temporal             Up                       7233
reelclone-auth-service          Up (healthy)
reelclone-user-service          Up (healthy)
...
reelclone-nginx                Up (healthy)             0.0.0.0:80->80, 0.0.0.0:443->443
```

### 查看日志

```bash
# 查看所有服务日志（实时）
docker compose -f docker/docker-compose.prod.yml logs -f

# 查看特定服务日志
docker compose -f docker/docker-compose.prod.yml logs -f auth-service

# 查看最近 100 行日志
docker compose -f docker/docker-compose.prod.yml logs --tail=100 workbench-service

# 查看 Nginx 访问日志（JSON 格式）
docker exec reelclone-nginx cat /var/log/nginx/access.log | jq .

# 查看特定时间段的日志
docker compose -f docker/docker-compose.prod.yml logs --since 30m
```

### 健康检查

```bash
# Nginx 入口健康检查
curl https://api.your-domain.com/health

# 各服务直连健康检查（仅容器内网络可达）
docker exec reelclone-nginx wget -qO- http://auth-service:3001/api/v1/auth/health
docker exec reelclone-nginx wget -qO- http://user-service:3002/api/v1/users/health
docker exec reelclone-nginx wget -qO- http://workbench-service:3007/api/v1/generations/health
```

### 资源使用

```bash
# 查看容器资源占用
docker stats --no-stream

# 查看磁盘使用
docker system df -v
```

### Temporal UI

Temporal Web UI 仅内网可达，用于查看工作流执行状态：

```bash
# 通过 SSH 隧道访问
ssh -L 8080:localhost:8080 user@server
# 浏览器访问 http://localhost:8080
```

---

## 常见问题排查

### 1. 服务启动失败

**现象**：`deploy.sh` 报告服务未通过健康检查

**排查步骤**：

```bash
# 1. 查看失败服务日志
docker compose -f docker/docker-compose.prod.yml logs --tail=100 <service-name>

# 2. 检查容器状态
docker ps -a | grep reelclone

# 3. 检查环境变量是否正确加载
docker exec <container> env | grep -E "DATABASE|REDIS|JWT"

# 4. 手动启动服务查看错误
docker compose -f docker/docker-compose.prod.yml up <service-name>
```

### 2. 数据库连接失败

**现象**：服务报 `ECONNREFUSED` 或 `password authentication failed`

**排查**：

```bash
# 1. 检查 postgres 是否 healthy
docker inspect reelclone-postgres | grep -A5 Health

# 2. 验证数据库连接
docker exec reelclone-postgres psql -U reelclone -d reelclone_main -c "SELECT 1;"

# 3. 检查 .env.production 中 DATABASE_PASSWORD 是否一致
grep DATABASE docker/.env.production

# 4. 确认 4 个业务库已创建
docker exec reelclone-postgres psql -U reelclone -l
```

### 3. Nginx 502 Bad Gateway

**现象**：API 请求返回 502

**排查**：

```bash
# 1. 检查上游服务是否 healthy
docker inspect reelclone-auth-service | grep -A5 Health

# 2. 检查 nginx 错误日志
docker exec reelclone-nginx cat /var/log/nginx/error.log | tail -20

# 3. 从 nginx 容器内测试上游
docker exec reelclone-nginx wget -qO- http://auth-service:3001/api/v1/auth/health
```

### 4. 微信支付回调失败

**现象**：微信支付回调返回 429 或 502

**排查**：

```bash
# 1. 确认 WECHAT_PAY_NOTIFY_URL 配置正确
grep NOTIFY_URL docker/.env.production

# 2. 确认域名 HTTPS 证书有效
curl -I https://api.your-domain.com/api/v1/webhooks/wechat-pay

# 3. 查看订单服务日志
docker logs reelclone-order-service --tail=100
```

### 5. WebSocket 连接失败

**现象**：小程序 WebSocket 无法连接

**排查**：

```bash
# 1. 检查 nginx WebSocket 配置
docker exec reelclone-nginx nginx -t

# 2. 测试 WebSocket 连接
wscat -c wss://api.your-domain.com/ws

# 3. 查看 notification-service 日志
docker logs reelclone-notification-service --tail=100
```

### 6. Temporal Worker 不处理任务

**现象**：生成任务卡在 pending 状态

**排查**：

```bash
# 1. 检查 temporal 是否运行
docker ps | grep temporal

# 2. 确认 TEMPORAL_MOCK_MODE=false
docker exec reelclone-media-worker env | grep TEMPORAL

# 3. 查看 worker 日志
docker logs reelclone-media-worker --tail=100

# 4. 通过 Temporal UI 查看工作流状态
# 访问 http://localhost:8080（需 SSH 隧道）
```

### 7. 磁盘空间不足

**现象**：服务无法写入日志或数据库

**排查**：

```bash
# 1. 查看磁盘使用
df -h

# 2. 查看 Docker 占用
docker system df

# 3. 清理无用的镜像和容器（谨慎）
docker system prune -a --volumes
# 注意：会删除所有未使用的镜像，慎用

# 4. 清理过期日志
docker compose -f docker/docker-compose.prod.yml logs --tail=0 -f &
# 或重建日志卷
docker volume rm reelclone-nginx-logs
```

---

## 备份与恢复

### 自动备份

建议通过 crontab 配置定时备份：

```bash
# 编辑 crontab
crontab -e

# 每日凌晨 3 点自动备份
0 3 * * * cd /path/to/ReelClone && bash scripts/backup-db.sh >> /var/log/reelclone-backup.log 2>&1

# 每周日凌晨 4 点全量备份（含镜像）
0 4 * * 0 docker image save $(docker images --format '{{.Repository}}:{{.Tag}}' | grep reelclone) -o /backups/reelclone-images-$(date +\%Y\%m\%d).tar
```

### 手动备份

```bash
# 执行备份
bash scripts/backup-db.sh

# 查看备份列表
bash scripts/backup-db.sh list
```

### 从备份恢复

```bash
# 列出可用备份
bash scripts/backup-db.sh list

# 从指定时间戳恢复
bash scripts/backup-db.sh restore 20250729_030000

# 恢复后重启服务
bash scripts/deploy.sh --no-build
```

### 备份保留策略

- 默认保留最近 **7 天** 的备份
- 过期备份在下次备份时自动清理
- 可通过 `backup-db.sh` 中的 `RETENTION_DAYS` 变量调整

### 镜像备份

```bash
# 导出所有镜像
docker image save \
  reelclone/auth-service:latest \
  reelclone/user-service:latest \
  reelclone/asset-service:latest \
  reelclone/benchmark-service:latest \
  reelclone/template-service:latest \
  reelclone/billing-service:latest \
  reelclone/workbench-service:latest \
  reelclone/notification-service:latest \
  reelclone/order-service:latest \
  reelclone/media-worker:latest \
  -o /backups/reelclone-images-$(date +%Y%m%d).tar

# 恢复镜像
docker image load -i /backups/reelclone-images-YYYYMMDD.tar
```

---

## 升级流程

### 1. 准备工作

```bash
# 1. 备份当前数据库
bash scripts/backup-db.sh

# 2. 记录当前版本
cd /path/to/ReelClone
git rev-parse HEAD > /backups/current-version.txt
docker images | grep reelclone > /backups/current-images.txt

# 3. 通知用户维护窗口（如有必要）
```

### 2. 拉取新代码

```bash
cd /path/to/ReelClone
git pull origin main
```

### 3. 检查配置变更

```bash
# 对比 .env.production.example 是否有新增变量
diff docker/.env.production.example docker/.env.production

# 如有新增变量，更新 .env.production
vim docker/.env.production
```

本版本的新 Temporal 工作流统一使用 `reelclone-tasks`，不再支持通过环境变量覆盖队列名。升级前请在 Temporal UI 检查旧队列 `video-generation`、`benchmark-analysis`、`template-generation` 和 `reelclone-default` 是否仍有在途任务；待其完成、取消或按业务规则重新提交后，再停掉旧 Worker。

### 4. 执行部署

```bash
# 标准部署（自动构建 + 迁移 + 启动）
bash scripts/deploy.sh

# 或分步执行
bash scripts/deploy.sh --no-pull    # 跳过 git pull
bash scripts/deploy.sh --no-build   # 跳过构建（使用已有镜像）
```

### 5. 验证升级

```bash
# 1. 健康检查
curl https://api.your-domain.com/health

# 2. 核心业务流程验证
# - 微信登录
# - 创建生成任务
# - 查询积分余额
# - 创建订单
# - WebSocket 通知

# 3. 查看日志无异常
docker compose -f docker/docker-compose.prod.yml logs --tail=100
```

### 6. 回滚（如升级失败）

```bash
# 查看可用版本
bash scripts/rollback.sh --list

# 回滚到上一个版本
bash scripts/rollback.sh

# 回滚到指定版本
bash scripts/rollback.sh <commit-hash>
```

**回滚注意事项**：

- ✅ 代码回滚：自动执行 `git reset --hard`
- ✅ 镜像回滚：自动重新构建上一版本镜像
- ✅ 数据库备份：回滚前自动备份当前数据库
- ❌ 数据库回滚：**不自动回滚**（迁移可能不可逆）
- ⚠️ 如需回滚数据库：从备份恢复 `bash scripts/backup-db.sh restore <timestamp>`

---

## 附录

### 常用命令速查

```bash
# === 部署 ===
bash scripts/deploy.sh                  # 部署
bash scripts/deploy.sh --no-build       # 跳过构建
bash scripts/rollback.sh                # 回滚
bash scripts/rollback.sh --list         # 列出版本

# === 备份 ===
bash scripts/backup-db.sh               # 备份
bash scripts/backup-db.sh list          # 列出备份
bash scripts/backup-db.sh restore <ts>  # 恢复

# === 运维 ===
docker compose -f docker/docker-compose.prod.yml ps          # 查看状态
docker compose -f docker/docker-compose.prod.yml logs -f     # 查看日志
docker compose -f docker/docker-compose.prod.yml restart <s> # 重启服务
docker compose -f docker/docker-compose.prod.yml down        # 停止所有
docker compose -f docker/docker-compose.prod.yml up -d <s>   # 启动单个
docker compose -f docker/docker-compose.prod.yml down -v    # ⚠️ 含数据卷

# === 数据库 ===
docker exec -it reelclone-postgres psql -U reelclone -d reelclone_main
docker exec reelclone-postgres pg_dump -U reelclone reelclone_main > backup.sql

# === Redis ===
docker exec -it reelclone-redis redis-cli -a $REDIS_PASSWORD
```

### 联系方式

- 仓库：https://github.com/your-org/ReelClone
- 文档：`docs/` 目录
- 问题反馈：GitHub Issues
