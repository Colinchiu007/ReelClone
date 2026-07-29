-- ============================================================
-- ReelClone PostgreSQL 初始化脚本
-- 在 docker-entrypoint-initdb.d 中自动执行
-- ============================================================
-- 说明：
--   reelclone_main 数据库由 POSTGRES_DB 环境变量自动创建
--   本脚本创建其余 3 个业务数据库 + temporal 用户/数据库
--   使用 \gexec 避免 CREATE DATABASE 不能在事务块中执行的问题
-- ============================================================

-- ------------------------------------------------------------
-- 1. 业务数据库（如果不存在则创建）
-- ------------------------------------------------------------

-- reelclone_main：用户/资产/作品/订单（已由 POSTGRES_DB 创建，此处幂等检查）
SELECT 'CREATE DATABASE reelclone_main OWNER reelclone'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'reelclone_main')\gexec

-- reelclone_billing：积分流水/账本
SELECT 'CREATE DATABASE reelclone_billing OWNER reelclone'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'reelclone_billing')\gexec

-- reelclone_template：模板/推荐
SELECT 'CREATE DATABASE reelclone_template OWNER reelclone'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'reelclone_template')\gexec

-- reelclone_benchmark：对标解析
SELECT 'CREATE DATABASE reelclone_benchmark OWNER reelclone'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'reelclone_benchmark')\gexec

-- ------------------------------------------------------------
-- 2. Temporal 用户和数据库
-- ------------------------------------------------------------

-- 创建 temporal 用户（如果不存在），授予 CREATEDB 以便 auto-setup 创建 visibility 库
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'temporal') THEN
        CREATE USER temporal WITH PASSWORD 'temporal' CREATEDB;
    ELSE
        ALTER USER temporal WITH PASSWORD 'temporal' CREATEDB;
    END IF;
END$$;

-- 授予 temporal 用户在 reelclone_main 上创建数据库的权限（auto-setup 需要）
ALTER USER temporal CREATEDB;

-- 创建 temporal 数据库（如果不存在）
SELECT 'CREATE DATABASE temporal OWNER temporal'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'temporal')\gexec

-- 创建 temporal_visibility 数据库（如果不存在，Temporal auto-setup 需要）
SELECT 'CREATE DATABASE temporal_visibility OWNER temporal'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'temporal_visibility')\gexec

-- ------------------------------------------------------------
-- 3. 授权
-- ------------------------------------------------------------
GRANT ALL PRIVILEGES ON DATABASE reelclone_main TO reelclone;
GRANT ALL PRIVILEGES ON DATABASE reelclone_billing TO reelclone;
GRANT ALL PRIVILEGES ON DATABASE reelclone_template TO reelclone;
GRANT ALL PRIVILEGES ON DATABASE reelclone_benchmark TO reelclone;
GRANT ALL PRIVILEGES ON DATABASE temporal TO temporal;
GRANT ALL PRIVILEGES ON DATABASE temporal_visibility TO temporal;

-- ------------------------------------------------------------
-- 4. 完成提示
-- ------------------------------------------------------------
\echo '✅ 数据库初始化完成: reelclone_main, reelclone_billing, reelclone_template, reelclone_benchmark, temporal, temporal_visibility'
