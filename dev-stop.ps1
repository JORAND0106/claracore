Set-StrictMode -Version Latest
$ErrorActionPreference = "SilentlyContinue"

Write-Host "Deteniendo entorno LOCAL de ClaraCore..." -ForegroundColor Cyan

# Backend local (uvicorn en puerto 8000)
Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -match "uvicorn main:app.*--port 8000" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

# Frontend local (vite en puerto 5173)
Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -match "vite --host 127.0.0.1 --port 5173" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Write-Host "Entorno local detenido." -ForegroundColor Green
