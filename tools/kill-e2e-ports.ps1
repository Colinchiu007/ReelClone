# Kill all processes on ports 3001-3009
$ports = 3001..3009
foreach ($port in $ports) {
    $conns = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    foreach ($conn in $conns) {
        $procId = $conn.OwningProcess
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            Write-Host "Killed PID $procId on port $port"
        } catch {
            Write-Host "PID $procId on port $port already gone"
        }
    }
}
Write-Host "Done"
