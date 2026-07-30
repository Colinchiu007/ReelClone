# ReelClone E2E Services Startup Script (PowerShell)
# Starts all 8 microservices as background processes

$ErrorActionPreference = 'SilentlyContinue'
$workspace = 'd:\Data\projects\ReelClone'
Set-Location $workspace

# Find node path (fnm / hermes / system PATH)
$nodeExe = $null
$fnmBase = "$env:LOCALAPPDATA\fnm_multishells"
if (Test-Path $fnmBase) {
    $latest = Get-ChildItem $fnmBase -Directory | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($latest -and (Test-Path (Join-Path $latest.FullName 'node.exe'))) {
        $nodeExe = Join-Path $latest.FullName 'node.exe'
    }
}
if (-not $nodeExe -and (Test-Path "$env:LOCALAPPDATA\hermes\node\node.exe")) {
    $nodeExe = "$env:LOCALAPPDATA\hermes\node\node.exe"
}
if (-not $nodeExe) {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { $nodeExe = $cmd.Source }
}
if (-not $nodeExe) { Write-Host 'ERROR: node not found'; exit 1 }
$nodeDir = Split-Path $nodeExe -Parent
$env:PATH = "$nodeDir;$env:PATH"
Write-Host "Using node: $nodeExe"
$env:NODE_ENV = 'development'
$env:TS_NODE_PROJECT = 'tsconfig.runtime.json'

# Load .env
Get-Content "$workspace\.env" | ForEach-Object {
    $line = $_.Trim()
    if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
        $idx = $line.IndexOf('=')
        $key = $line.Substring(0, $idx).Trim()
        $val = $line.Substring($idx + 1).Trim()
        Set-Item -Path "Env:$key" -Value $val
    }
}

$logDir = "$workspace\.e2e-logs"
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }

$tsNode = "$workspace\node_modules\ts-node\dist\bin.js"
$tsArgs = '--transpile-only -r tsconfig-paths/register -P tsconfig.runtime.json'

$services = @(
    @{ name='auth';         app='auth-service';         port=3001 },
    @{ name='user';         app='user-service';         port=3002 },
    @{ name='asset';        app='asset-service';        port=3003 },
    @{ name='benchmark';    app='benchmark-service';    port=3004 },
    @{ name='template';     app='template-service';     port=3005 },
    @{ name='billing';      app='billing-service';      port=3006 },
    @{ name='workbench';    app='workbench-service';    port=3007 },
    @{ name='notification'; app='notification-service'; port=3008 },
    @{ name='order';        app='order-service';        port=3009 }
)

foreach ($svc in $services) {
    $mainFile = "apps/$($svc.app)/src/main.ts"
    $logFile = "$logDir\$($svc.app).log"
    Write-Host "Starting $($svc.app) on port $($svc.port)..."
    Start-Process -FilePath 'node' `
        -ArgumentList @($tsNode, '--transpile-only', '-r', 'tsconfig-paths/register', '-P', 'tsconfig.runtime.json', $mainFile) `
        -WorkingDirectory $workspace `
        -RedirectStandardOutput $logFile `
        -RedirectStandardError "$logDir\$($svc.app).err.log" `
        -NoNewWindow -PassThru | Out-Null
    Start-Sleep -Seconds 5
}

Write-Host "`nWaiting 45s for services to initialize..."
Start-Sleep -Seconds 45

Write-Host "`nHealth Check:"
foreach ($svc in $services) {
    $ok = (Test-NetConnection -ComputerName localhost -Port $svc.port -WarningAction SilentlyContinue).TcpTestSucceeded
    if ($ok) {
        Write-Host "  OK   $($svc.name) (port $($svc.port))" -ForegroundColor Green
    } else {
        Write-Host "  FAIL $($svc.name) (port $($svc.port))" -ForegroundColor Red
    }
}
