Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$backendDir = Join-Path $root "backend"
$frontendDir = Join-Path $root "frontend"

Write-Host "Iniciando entorno LOCAL seguro de ClaraCore..." -ForegroundColor Cyan

Start-Process -FilePath "powershell" -WorkingDirectory $backendDir -ArgumentList @(
    "-NoExit",
    "-Command",
    "python -m uvicorn main:app --reload --host 127.0.0.1 --port 8000"
) | Out-Null

Start-Process -FilePath "powershell" -WorkingDirectory $frontendDir -ArgumentList @(
    "-NoExit",
    "-Command",
    "npm run dev -- --host 127.0.0.1 --port 5173"
) | Out-Null

Write-Host ""
Write-Host "Entorno levantado." -ForegroundColor Green
Write-Host "Frontend local: http://127.0.0.1:5173" -ForegroundColor Green
Write-Host "Backend local:  http://127.0.0.1:8000" -ForegroundColor Green
Write-Host ""
Write-Host "Regla de seguridad: NO ejecutar .\db.ps1 ni .\df.ps1 durante pruebas." -ForegroundColor Yellow
