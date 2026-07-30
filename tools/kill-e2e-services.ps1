# Kill all processes on ports 3001-3009 and any stale node service processes
$ports = 3001..3009
$killed = @()
foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        $procId = $conn.OwningProcess
        if ($procId -and ($procId -ne 0)) {
            $proc = Get-Process -Id $procId -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "Killing PID $procId ($($proc.ProcessName)) on port $port"
                Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
                $killed += $procId
            }
        }
    }
}

# Also kill any stale npx/ts-node processes from previous runs
Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object {
    $_.MainWindowTitle -match "ts-node|nest" -or $_.Path -match "ts-node"
} | ForEach-Object {
    Write-Host "Killing stale node process PID $($_.Id)"
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    $killed += $_.Id
}

Start-Sleep -Seconds 2
Write-Host "`nKilled $($killed.Count) processes"

# Verify ports are free
Write-Host "`nPort status after cleanup:"
foreach ($port in $ports) {
    $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if ($conn) {
        Write-Host "  Port ${port} - STILL IN USE (PID $($conn.OwningProcess))"
    } else {
        Write-Host "  Port ${port} - free"
    }
}
