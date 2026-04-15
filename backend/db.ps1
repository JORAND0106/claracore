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

Write-Host "Deployando backend..." -ForegroundColor Cyan
Compress-Archive -Path * -DestinationPath ../deploy.zip -Force
az webapp deploy --name claracore-backend --resource-group andres_jaimes82_rg_5760 --src-path ../deploy.zip --type zip
Remove-Item ../deploy.zip -Force

Write-Host "Desactivando modo mantenimiento..." -ForegroundColor Yellow
try {
    $bodyOff = '{"secret":"claracore_deploy_2026","activo":false,"mensaje":"Actualizacion finalizada. Recargando sistema..."}'
    Invoke-RestMethod -Uri "https://claracore-backend.azurewebsites.net/mantenimiento" -Method POST -Body $bodyOff -ContentType "application/json" | Out-Null
} catch {
    Write-Host "No se pudo desactivar mantenimiento automaticamente." -ForegroundColor DarkYellow
}

Write-Host "Deploy completado!" -ForegroundColor Green
