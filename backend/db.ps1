Set-Location $PSScriptRoot

Write-Host "ADVERTENCIA: este comando despliega backend en PRODUCCION." -ForegroundColor Yellow
$confirm = Read-Host "Escribe DEPLOY para continuar (o Enter para cancelar)"
if ($confirm -ne "DEPLOY") {
    Write-Host "Deploy cancelado por seguridad." -ForegroundColor DarkYellow
    exit 1
}

Write-Host "Activando modo mantenimiento..." -ForegroundColor Yellow
try {
    $body = '{"secret":"claracore_deploy_2026","activo":true,"segundos":180,"mensaje":"Actualizacion del sistema en curso. Por favor guarda tu trabajo antes de continuar."}'
    Invoke-RestMethod -Uri "https://claracore-backend.azurewebsites.net/mantenimiento" -Method POST -Body $body -ContentType "application/json" | Out-Null
    Write-Host "Modo mantenimiento activado. Esperando 10 segundos..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10
} catch {
    Write-Host "No se pudo activar mantenimiento (backend offline?). Continuando..." -ForegroundColor DarkYellow
}

Write-Host "Preparando paquete (sin __pycache__, venv ni .env local)..." -ForegroundColor Cyan
$zipPath = Join-Path $PSScriptRoot "..\deploy.zip"
$staging = Join-Path $env:TEMP ("claracore-backend-deploy-" + [Guid]::NewGuid().ToString("N"))
if (Test-Path $zipPath) { Remove-Item -LiteralPath $zipPath -Force }
if (Test-Path $staging) { Remove-Item -LiteralPath $staging -Recurse -Force }
New-Item -ItemType Directory -Path $staging | Out-Null
# Robocopy: 0-7 = OK (ver https://learn.microsoft.com/en-us/troubleshoot/windows-server/backup-and-storage/return-codes-used-robocopy-task)
robocopy $PSScriptRoot $staging /MIR /XD __pycache__ .venv venv .git .pytest_cache .azure /XF *.pyc .env deploy.zip /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) {
    Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host "ERROR: robocopy fallo al preparar staging (codigo $LASTEXITCODE)." -ForegroundColor Red
    exit 1
}
Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $zipPath -Force
Remove-Item -LiteralPath $staging -Recurse -Force

Write-Host "Subiendo a Azure (asincrono: evita 504 Gateway Timeout del deploy largo)..." -ForegroundColor Cyan
# --async true: el CLI termina al subir el ZIP; Kudu extrae en segundo plano (el modo sync a menudo corta con 504).
# --track-status false: no esperar arranque del sitio en Linux (reduce tiempo de espera del comando).
az webapp deploy --name claracore-backend --resource-group andres_jaimes82_rg_5760 --src-path $zipPath --type zip --async true --track-status false
if ($LASTEXITCODE -ne 0) {
    Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
    Write-Host "ERROR: az webapp deploy fallo (codigo $LASTEXITCODE)." -ForegroundColor Red
    exit 1
}
Remove-Item -LiteralPath $zipPath -Force

Write-Host "Esperando ~90 s para que Kudu termine de extraer y reiniciar (deploy asincrono)..." -ForegroundColor DarkYellow
Start-Sleep -Seconds 90

Write-Host "Desactivando modo mantenimiento..." -ForegroundColor Yellow
try {
    $bodyOff = '{"secret":"claracore_deploy_2026","activo":false,"mensaje":"Actualizacion finalizada. Recargando sistema..."}'
    Invoke-RestMethod -Uri "https://claracore-backend.azurewebsites.net/mantenimiento" -Method POST -Body $bodyOff -ContentType "application/json" | Out-Null
} catch {
    Write-Host "No se pudo desactivar mantenimiento automaticamente." -ForegroundColor DarkYellow
}

Write-Host "Deploy completado!" -ForegroundColor Green
