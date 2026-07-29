#!/usr/bin/env node
/**
 * ReelClone 本地开发环境引导脚本
 *
 * 功能：
 *   1. 启动 docker compose up -d
 *   2. 等待 PostgreSQL 健康检查通过（最多 30 秒）
 *   3. 等待 Redis 健康检查通过
 *   4. 输出成功提示并指引后续步骤
 *
 * 使用方式：
 *   node tools/bootstrap.js
 *   或在 package.json 中添加："bootstrap": "node tools/bootstrap.js"
 *
 * 仅使用 Node.js 内置模块，无需 npm install。
 */

'use strict';

const { execSync, spawnSync } = require('child_process');
const path = require('path');

// ============================================================
// 配置
// ============================================================
const DOCKER_DIR = path.resolve(__dirname, '..', 'docker');
const POSTGRES_CONTAINER = 'reelclone-postgres';
const REDIS_CONTAINER = 'reelclone-redis';
const POSTGRES_TIMEOUT_MS = 30_000; // 30 秒
const REDIS_TIMEOUT_MS = 30_000;
const POLL_INTERVAL_MS = 1_000;

// ============================================================
// 工具函数
// ============================================================

/**
 * 带颜色的控制台输出
 */
const log = {
    info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m  ${msg}`),
    ok: (msg) => console.log(`\x1b[32m[OK]\x1b[0m    ${msg}`),
    warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m  ${msg}`),
    error: (msg) => console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
    step: (msg) => console.log(`\x1b[35m[STEP]\x1b[0m  ${msg}`),
};

/**
 * 执行命令并返回输出（同步）
 */
function run(cmd, options = {}) {
    return spawnSync(cmd, {
        shell: true,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options,
    });
}

/**
 * 检查 Docker 是否可用
 */
function checkDockerAvailable() {
    const result = run('docker --version');
    if (result.status !== 0) {
        log.error('未检测到 Docker，请先安装 Docker Desktop。');
        log.error('下载地址: https://www.docker.com/products/docker-desktop');
        process.exit(1);
    }

    const composeResult = run('docker compose version');
    if (composeResult.status !== 0) {
        log.error('未检测到 docker compose 插件，请升级 Docker 版本。');
        process.exit(1);
    }

    log.ok(`Docker 已就绪: ${result.stdout.trim()}`);
}

/**
 * 检查容器健康状态
 * @param {string} containerName 容器名
 * @returns {'healthy'|'unhealthy'|'starting'|'none'} 健康状态
 */
function getHealthStatus(containerName) {
    const result = run(
        `docker inspect --format="{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" ${containerName}`
    );
    if (result.status !== 0) {
        return 'none';
    }
    return result.stdout.trim() || 'none';
}

/**
 * 等待容器健康检查通过
 * @param {string} containerName 容器名
 * @param {number} timeoutMs 超时时间（毫秒）
 * @returns {boolean} 是否健康
 */
function waitForHealthy(containerName, timeoutMs) {
    const startTime = Date.now();
    let lastStatus = 'none';

    while (Date.now() - startTime < timeoutMs) {
        lastStatus = getHealthStatus(containerName);

        if (lastStatus === 'healthy') {
            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            log.ok(`${containerName} 健康检查通过（耗时 ${elapsed}s）`);
            return true;
        }

        if (lastStatus === 'unhealthy') {
            log.warn(`${containerName} 当前状态: unhealthy，继续等待...`);
        } else if (lastStatus === 'none') {
            log.warn(`${containerName} 未找到健康检查信息，可能容器未启动`);
            return false;
        } else {
            // starting / 空
            process.stdout.write('.');
        }

        // 同步等待
        spawnSync('timeout /t 1 /nobreak >nul', { shell: true });
    }

    console.log('');
    log.error(`${containerName} 在 ${timeoutMs / 1000}s 内未通过健康检查（最后状态: ${lastStatus}）`);
    return false;
}

/**
 * 启动 docker compose
 */
function startDockerCompose() {
    log.step(`启动 Docker Compose（目录: ${DOCKER_DIR}）`);

    const result = run('docker compose up -d', { cwd: DOCKER_DIR });

    if (result.status !== 0) {
        log.error('docker compose up -d 失败:');
        log.error(result.stderr || result.stdout || '未知错误');
        process.exit(1);
    }

    // 输出 docker compose 的日志
    if (result.stdout) {
        result.stdout.split('\n').filter(Boolean).forEach((line) => {
            console.log(`         ${line}`);
        });
    }

    log.ok('Docker Compose 已启动');
}

/**
 * 验证 PostgreSQL 数据库可连接
 */
function verifyPostgresDatabases() {
    log.step('验证 PostgreSQL 4 个业务数据库可连接');

    const databases = ['reelclone_main', 'reelclone_billing', 'reelclone_template', 'reelclone_benchmark'];
    const allOk = databases.every((db) => {
        const result = run(
            `docker exec ${POSTGRES_CONTAINER} psql -U reelclone -d ${db} -c "SELECT 1;" -t`
        );
        if (result.status === 0) {
            log.ok(`  ✓ ${db}`);
            return true;
        }
        log.error(`  ✗ ${db} 连接失败`);
        return false;
    });

    return allOk;
}

/**
 * 验证 Redis 可连接
 */
function verifyRedis() {
    log.step('验证 Redis 可连接');

    const result = run(`docker exec ${REDIS_CONTAINER} redis-cli ping`);
    if (result.status === 0 && result.stdout.trim() === 'PONG') {
        log.ok('Redis PING -> PONG');
        return true;
    }

    log.error(`Redis ping 失败: ${result.stderr || result.stdout}`);
    return false;
}

/**
 * 输出后续步骤提示
 */
function printNextSteps() {
    console.log('');
    console.log('┌──────────────────────────────────────────────────────────────┐');
    console.log('│                                                              │');
    console.log('│  ✅ 本地环境启动完成                                          │');
    console.log('│                                                              │');
    console.log('│  服务端口:                                                    │');
    console.log('│    • PostgreSQL:  localhost:5432                              │');
    console.log('│    • Redis:        localhost:6379                              │');
    console.log('│    • Temporal:     localhost:7233                              │');
    console.log('│                                                              │');
    console.log('│  数据库连接串:                                                │');
    console.log('│    postgresql://reelclone:reelclone_dev@localhost:5432/<db>   │');
    console.log('│                                                              │');
    console.log('│  下一步:                                                      │');
    console.log('│    1. npm install                                             │');
    console.log('│    2. npm run migration:run                                    │');
    console.log('│                                                              │');
    console.log('└──────────────────────────────────────────────────────────────┘');
    console.log('');
}

// ============================================================
// 主流程
// ============================================================
function main() {
    console.log('');
    console.log('🔧 ReelClone 本地开发环境引导');
    console.log('============================================================');
    console.log('');

    // 1. 检查 Docker 可用性
    checkDockerAvailable();
    console.log('');

    // 2. 启动 docker compose
    startDockerCompose();
    console.log('');

    // 3. 等待 PostgreSQL 健康
    log.step(`等待 PostgreSQL 健康检查通过（最多 ${POSTGRES_TIMEOUT_MS / 1000}s）`);
    const pgHealthy = waitForHealthy(POSTGRES_CONTAINER, POSTGRES_TIMEOUT_MS);
    if (!pgHealthy) {
        log.error('PostgreSQL 启动失败，请检查日志: docker logs reelclone-postgres');
        process.exit(1);
    }
    console.log('');

    // 4. 等待 Redis 健康
    log.step(`等待 Redis 健康检查通过（最多 ${REDIS_TIMEOUT_MS / 1000}s）`);
    const redisHealthy = waitForHealthy(REDIS_CONTAINER, REDIS_TIMEOUT_MS);
    if (!redisHealthy) {
        log.error('Redis 启动失败，请检查日志: docker logs reelclone-redis');
        process.exit(1);
    }
    console.log('');

    // 5. 验证数据库可连接
    const dbOk = verifyPostgresDatabases();
    console.log('');

    // 6. 验证 Redis
    const redisOk = verifyRedis();
    console.log('');

    if (!dbOk || !redisOk) {
        log.error('环境验证失败，请检查容器日志。');
        process.exit(1);
    }

    // 7. 输出后续步骤
    printNextSteps();
}

main();
