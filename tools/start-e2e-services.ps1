# ReelClone E2E Services Launcher (ASCII-only to avoid encoding issues)
$workspaceRoot = "d:\Data\projects\ReelClone"
$logDir = Join-Path $workspaceRoot ".e2e-logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

# Setup PATH with fnm node
$env:NODE_ENV = "development"
$fnmBase = Join-Path $env:LOCALAPPDATA "fnm_multishells"
$fnmPath = $null
if (Test-Path $fnmBase) {
    $latest = Get-ChildItem $fnmBase -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latest -and (Test-Path (Join-Path $latest.FullName "node.exe"))) {
        $fnmPath = $latest.FullName
    }
}
if (-not $fnmPath) {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if ($nodeCmd) { $fnmPath = Split-Path $nodeCmd.Source -Parent }
}
if ($fnmPath) { $env:Path = "$fnmPath;" + $env:Path }
Write-Host "Using node from: $fnmPath"

# Load .env
$envFile = Join-Path $workspaceRoot ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith("#") -and $line.Contains("=")) {
            $idx = $line.IndexOf("=")
            $key = $line.Substring(0, $idx).Trim()
            $val = $line.Substring($idx + 1).Trim()
            Set-Item -Path "Env:$key" -Value $val
        }
    }
}

# Services list
$services = @(
    @{ name = "auth";         app = "auth-service";         port = 3001 },
    @{ name = "user";         app = "user-service";         port = 3002 },
    @{ name = "asset";        app = "asset-service";        port = 3003 },
    @{ name = "benchmark";    app = "benchmark-service";    port = 3004 },
    @{ name = "billing";      app = "billing-service";      port = 3006 },
    @{ name = "workbench";    app = "workbench-service";    port = 3007 },
    @{ name = "notification"; app = "notification-service"; port = 3008 },
    @{ name = "order";        app = "order-service";        port = 3009 }
)

# Launch each service
$processes = @()
foreach ($svc in $services) {
    $app = $svc.app
    $logFile = Join-Path $logDir "$app.log"
    $errFile = Join-Path $logDir "$app.err.log"
    Write-Host "Starting $app (port $($svc.port))..."
    $proc = Start-Process -FilePath "npx.cmd" `
        -ArgumentList "ts-node","--transpile-only","-r","tsconfig-paths/register","-P","tsconfig.runtime.json","apps/$app/src/main.ts" `
        -WorkingDirectory $workspaceRoot `
        -RedirectStandardOutput $logFile `
        -RedirectStandardError $errFile `
        -NoNewWindow -PassThru
    $processes += @{ svc = $svc; proc = $proc }
    Start-Sleep -Seconds 3
}

# Wait for readiness (max 120s)
Write-Host "`nWaiting for services to be ready (max 120s)..."
$maxWait = 120
$startTime = Get-Date
$allReady = $false
while (-not $allReady -and ((Get-Date) - $startTime).TotalSeconds -lt $maxWait) {
    $allReady = $true
    foreach ($p in $processes) {
        $port = $p.svc.port
        $conn = Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue
        if (-not $conn.TcpTestSucceeded) { $allReady = $false }
    }
    if (-not $allReady) {
        $elapsed = [int]((Get-Date) - $startTime).TotalSeconds
        Write-Host "  [$elapsed s] still waiting..."
        Start-Sleep -Seconds 5
    }
}

if ($allReady) {
    Write-Host "`n[OK] All 8 services are ready!" -ForegroundColor Green
    foreach ($p in $processes) {
        Write-Host "  [OK] $($p.svc.name) (port $($p.svc.port)) - PID $($p.proc.Id)"
    }
} else {
    Write-Host "`n[FAIL] Some services failed to start:" -ForegroundColor Red
    foreach ($p in $processes) {
        $port = $p.svc.port
        $conn = Test-NetConnection -ComputerName localhost -Port $port -WarningAction SilentlyContinue
        if (-not $conn.TcpTestSucceeded) {
            Write-Host "  [FAIL] $($p.svc.name) (port $port)"
            $errLog = Join-Path $logDir "$($p.svc.app).err.log"
            if (Test-Path $errLog) {
                Write-Host "     Last 10 lines of stderr:"
                Get-Content $errLog -Tail 10 | ForEach-Object { Write-Host "       $_" }
            }
        }
    }
}

# Save PIDs for cleanup
$pids = ($processes | ForEach-Object { $_.proc.Id }) -join ","
$pidFile = Join-Path $logDir "service-pids.txt"
Set-Content -Path $pidFile -Value $pids -Encoding ascii
Write-Host "`nSERVICE_PIDS=$pids"
Write-Host "LOG_DIR=$logDir"
