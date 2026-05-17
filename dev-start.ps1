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
# Comillas simples: si no, PowerShell reemplaza $env aquí y el hijo recibe "=1" y muestra error rojo.
Start-Process -FilePath "powershell" -WorkingDirectory $backendDir -ArgumentList @(
    "-NoExit",
    "-Command",
    '$env:WATCHFILES_FORCE_POLLING = "1"; python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000'
) | Out-Null

Start-Process -FilePath "powershell" -WorkingDirectory $frontendDir -ArgumentList @(
    "-NoExit",
    "-Command",
    "npm run dev -- --host 127.0.0.1 --port 5173"
) | Out-Null

Write-Host "Esperando arranque (5 s)..." -ForegroundColor DarkGray
Start-Sleep -Seconds 5

$apiOk = $false
$feOk = $false
try {
    $r = Invoke-WebRequest -Uri "http://127.0.0.1:8000/healthz" -UseBasicParsing -TimeoutSec 6
    $apiOk = ($r.StatusCode -eq 200)
} catch { }
try {
    $r2 = Invoke-WebRequest -Uri "http://127.0.0.1:5173/" -UseBasicParsing -TimeoutSec 6
    $feOk = ($r2.StatusCode -ge 200 -and $r2.StatusCode -lt 500)
} catch { }

Write-Host ""
if ($apiOk -and $feOk) {
    Write-Host "Entorno LOCAL listo." -ForegroundColor Green
} elseif (-not $apiOk) {
    Write-Host "ATENCION: el backend NO responde en :8000." -ForegroundColor Red
    Write-Host "  Revise la ventana PowerShell del backend (errores de Python/.env)." -ForegroundColor Yellow
} elseif (-not $feOk) {
    Write-Host "ATENCION: Vite NO responde en :5173." -ForegroundColor Red
    Write-Host "  Revise la ventana PowerShell del frontend." -ForegroundColor Yellow
}
Write-Host "Frontend: http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "Backend:  http://127.0.0.1:8000/docs" -ForegroundColor Green
Write-Host ""
Write-Host "Comprobar estado: .\dev-status.ps1" -ForegroundColor Cyan
Write-Host ""
Write-Host "db.ps1 y df.ps1 = DESPLIEGUE A AZURE (no inician local)." -ForegroundColor Yellow
Write-Host "Para probar en tu PC solo use dev-start + esas dos ventanas abiertas." -ForegroundColor Yellow
