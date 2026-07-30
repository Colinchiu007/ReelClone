@echo off
REM ReelClone E2E Services Startup Script
REM Starts all 8 microservices in background windows

set WORKSPACE=d:\Data\projects\ReelClone
cd /d %WORKSPACE%

REM Setup fnm/node path
for /f "tokens=*" %%i in ('dir /b /ad /o-d "%LOCALAPPDATA%\fnm_multishells" 2^>nul') do set FNM_SHELL=%%i
if defined FNM_SHELL set PATH=%LOCALAPPDATA%\fnm_multishells\%FNM_SHELL%;%PATH%

REM Load .env
for /f "usebackq tokens=1,* delims==" %%a in ("%WORKSPACE%\.env") do (
    set "%%a=%%b"
)

set NODE_ENV=development
set TS_NODE_PROJECT=tsconfig.runtime.json

echo Starting all services...

start "auth-service" /min cmd /c "node node_modules\ts-node\dist\bin.js --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps\auth-service\src\main.ts > .e2e-logs\auth-service.log 2>&1"
timeout /t 3 /nobreak >nul

start "user-service" /min cmd /c "node node_modules\ts-node\dist\bin.js --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps\user-service\src\main.ts > .e2e-logs\user-service.log 2>&1"
timeout /t 3 /nobreak >nul

start "asset-service" /min cmd /c "node node_modules\ts-node\dist\bin.js --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps\asset-service\src\main.ts > .e2e-logs\asset-service.log 2>&1"
timeout /t 3 /nobreak >nul

start "benchmark-service" /min cmd /c "node node_modules\ts-node\dist\bin.js --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps\benchmark-service\src\main.ts > .e2e-logs\benchmark-service.log 2>&1"
timeout /t 3 /nobreak >nul

start "billing-service" /min cmd /c "node node_modules\ts-node\dist\bin.js --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps\billing-service\src\main.ts > .e2e-logs\billing-service.log 2>&1"
timeout /t 3 /nobreak >nul

start "workbench-service" /min cmd /c "node node_modules\ts-node\dist\bin.js --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps\workbench-service\src\main.ts > .e2e-logs\workbench-service.log 2>&1"
timeout /t 3 /nobreak >nul

start "notification-service" /min cmd /c "node node_modules\ts-node\dist\bin.js --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps\notification-service\src\main.ts > .e2e-logs\notification-service.log 2>&1"
timeout /t 3 /nobreak >nul

start "order-service" /min cmd /c "node node_modules\ts-node\dist\bin.js --transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json apps\order-service\src\main.ts > .e2e-logs\order-service.log 2>&1"

echo All services started. Waiting 45s for health...
timeout /t 45 /nobreak >nul

echo Checking ports...
for %%p in (3001 3002 3003 3004 3006 3007 3008 3009) do (
    powershell -Command "if (Test-NetConnection -ComputerName localhost -Port %%p -WarningAction SilentlyContinue).TcpTestSucceeded { Write-Host '  OK port %%p' } else { Write-Host '  FAIL port %%p' }"
)

echo Done.
