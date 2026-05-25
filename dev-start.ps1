Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

Write-Host "Iniciando entorno LOCAL seguro de ClaraCore..." -ForegroundColor Cyan

# Si ya había un Python escuchando en 8000 (código viejo sin rutas nuevas), el navegador muestra «Not Found» en Informes.
# Cerrar ese proceso obliga a cargar el main.py / informes.py actuales de esta carpeta.
try {
    $listen8000 = Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue
    foreach ($conn in $listen8000) {
        $procId = [int]$conn.OwningProcess
        if ($procId -gt 0) {
            Write-Host "Cerrando proceso anterior en puerto 8000 (PID $procId)..." -ForegroundColor DarkYellow
            Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
        }
    }
    Start-Sleep -Milliseconds 500
} catch { }

# OneDrive suele impedir que --reload detecte cambios; el polling evita servir código viejo sin rutas nuevas.
# --timeout-graceful-shutdown: si hay peticiones largas (dashboard-resumen, drill), el reload no queda colgado
#   en «Waiting for connections to close» hasta que cierres manualmente las ventanas.
# --reload-delay: agrupa cambios seguidos en .py (evita reinicios en cadena mientras Cursor guarda).
Write-Host "Arrancando backend (FastAPI :8000)..." -ForegroundColor DarkGray
Start-Process -FilePath "powershell" -WorkingDirectory $backendDir -ArgumentList @(
    "-NoExit",
    "-Command",
    '$env:WATCHFILES_FORCE_POLLING = "1"; python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000 --reload-delay 2 --timeout-graceful-shutdown 8'
) | Out-Null

Write-Host "Esperando backend en :8000 (hasta 45 s)..." -ForegroundColor DarkGray
$apiOk = $false
for ($intento = 1; $intento -le 15; $intento += 1) {
    try {
        $r = Invoke-WebRequest -Uri "http://127.0.0.1:8000/healthz" -UseBasicParsing -TimeoutSec 3
        if ($r.StatusCode -eq 200) {
            $apiOk = $true
            break
        }
    } catch { }
    if ($intento -lt 15) { Start-Sleep -Seconds 3 }
}

if (-not $apiOk) {
    Write-Host ""
    Write-Host "FALLO: el backend NO responde en :8000." -ForegroundColor Red
    Write-Host "  Revise la ventana PowerShell del backend (errores de Python, .env o imports)." -ForegroundColor Yellow
    Write-Host "  No se iniciará Vite hasta que /healthz responda (evita ECONNREFUSED en el proxy)." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Diagnóstico: .\dev-status.ps1" -ForegroundColor Cyan
    exit 1
}

Write-Host "Backend OK. Arrancando frontend (Vite :5173)..." -ForegroundColor DarkGray
Start-Process -FilePath "powershell" -WorkingDirectory $frontendDir -ArgumentList @(
    "-NoExit",
    "-Command",
    "npm run dev -- --host 127.0.0.1 --port 5173"
) | Out-Null

$feOk = $false
for ($intento = 1; $intento -le 15; $intento += 1) {
    try {
        $r2 = Invoke-WebRequest -Uri "http://127.0.0.1:5173/" -UseBasicParsing -TimeoutSec 3
        if ($r2.StatusCode -ge 200 -and $r2.StatusCode -lt 500) {
            $feOk = $true
            break
        }
    } catch { }
    if ($intento -lt 15) { Start-Sleep -Seconds 2 }
}

Write-Host ""
if ($feOk) {
    Write-Host "Entorno LOCAL listo." -ForegroundColor Green
} else {
    Write-Host "ATENCION: Vite NO responde en :5173." -ForegroundColor Red
    Write-Host "  Revise la ventana PowerShell del frontend (npm install, puerto ocupado)." -ForegroundColor Yellow
}
Write-Host "Frontend: http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "Backend:  http://127.0.0.1:8000/docs" -ForegroundColor Green
Write-Host ""
Write-Host "Comprobar estado: .\dev-status.ps1" -ForegroundColor Cyan
Write-Host "Si el backend queda en «Waiting for connections to close», use .\dev-stop.ps1 y vuelva a .\dev-start.ps1" -ForegroundColor DarkYellow
Write-Host ""
Write-Host "db.ps1 y df.ps1 = DESPLIEGUE A AZURE (no inician local)." -ForegroundColor Yellow
Write-Host "Para probar en tu PC solo use dev-start + esas dos ventanas abiertas." -ForegroundColor Yellow
