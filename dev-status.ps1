# Comprueba si el entorno local ClaraCore esta arriba (puertos 8000 y 5173).
$ErrorActionPreference = "SilentlyContinue"

function Test-Url($url) {
    try {
        $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 4
        return @{ ok = $true; code = [int]$r.StatusCode }
    } catch {
        return @{ ok = $false; err = $_.Exception.Message }
    }
}

Write-Host ""
Write-Host "=== ClaraCore - estado local ===" -ForegroundColor Cyan

foreach ($port in @(8000, 5173)) {
    $c = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($c) {
        $p = Get-Process -Id $c.OwningProcess -ErrorAction SilentlyContinue
        Write-Host "Puerto $port : ESCUCHANDO (PID $($c.OwningProcess) - $($p.ProcessName))" -ForegroundColor Green
    } else {
        Write-Host "Puerto $port : LIBRE (servicio no iniciado)" -ForegroundColor Red
    }
}

$api = Test-Url "http://127.0.0.1:8000/healthz"
if ($api.ok) {
    Write-Host "API /healthz     : OK ($($api.code))" -ForegroundColor Green
} else {
    Write-Host "API /healthz     : FALLO - $($api.err)" -ForegroundColor Red
}

$fe = Test-Url "http://127.0.0.1:5173/"
if ($fe.ok) {
    Write-Host "Frontend Vite   : OK ($($fe.code))" -ForegroundColor Green
} else {
    Write-Host "Frontend Vite   : FALLO - $($fe.err)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Para levantar local:  .\dev-start.ps1" -ForegroundColor Yellow
Write-Host "NO uses .\db.ps1 ni .\df.ps1 para probar en tu PC (eso despliega a Azure)." -ForegroundColor DarkYellow
Write-Host ""
