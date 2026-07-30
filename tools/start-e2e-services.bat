@echo off
REM ReelClone E2E 服务启动脚本
REM 在后台启动 8 个微服务

set FNM_PATH=C:\Users\邱领\AppData\Local\fnm_multishells\14312_1785374547373
set PATH=%FNM_PATH%;%PATH%
set NODE_ENV=development
set WORKSPACE=d:\Data\projects\ReelClone

REM 加载 .env 环境变量
for /f "usebackq tokens=1,* delims==" %%a in ("%WORKSPACE%\.env") do (
    set %%a=%%b
)

cd /d %WORKSPACE%

echo Starting auth-service (3001)...
start "auth-service" /min cmd /c "npx ts-node --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps/auth-service/src/main.ts > .e2e-logs\auth.log 2>&1"
timeout /t 3 /nobreak >nul

echo Starting user-service (3002)...
start "user-service" /min cmd /c "npx ts-node --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps/user-service/src/main.ts > .e2e-logs\user.log 2>&1"
timeout /t 3 /nobreak >nul

echo Starting asset-service (3003)...
start "asset-service" /min cmd /c "npx ts-node --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps/asset-service/src/main.ts > .e2e-logs\asset.log 2>&1"
timeout /t 3 /nobreak >nul

echo Starting benchmark-service (3004)...
start "benchmark-service" /min cmd /c "npx ts-node --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps/benchmark-service/src/main.ts > .e2e-logs\benchmark.log 2>&1"
timeout /t 3 /nobreak >nul

echo Starting billing-service (3006)...
start "billing-service" /min cmd /c "npx ts-node --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps/billing-service/src/main.ts > .e2e-logs\billing.log 2>&1"
timeout /t 3 /nobreak >nul

echo Starting workbench-service (3007)...
start "workbench-service" /min cmd /c "npx ts-node --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps/workbench-service/src/main.ts > .e2e-logs\workbench.log 2>&1"
timeout /t 3 /nobreak >nul

echo Starting notification-service (3008)...
start "notification-service" /min cmd /c "npx ts-node --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps/notification-service/src/main.ts > .e2e-logs\notification.log 2>&1"
timeout /t 3 /nobreak >nul

echo Starting order-service (3009)...
start "order-service" /min cmd /c "npx ts-node --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps/order-service/src/main.ts > .e2e-logs\order.log 2>&1"
timeout /t 3 /nobreak >nul

echo.
echo All 8 services launched. Waiting 30s for them to initialize...
timeout /t 30 /nobreak >nul
echo Done. Check .e2e-logs for details.
