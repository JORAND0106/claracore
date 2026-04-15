Set-Location $PSScriptRoot

Write-Host "Activando modo mantenimiento..." -ForegroundColor Yellow
try {
    $body = '{"secret":"claracore_deploy_2026","activo":true,"segundos":25,"mensaje":"Actualizacion del sistema en curso. Por favor guarda tu trabajo antes de continuar."}'
    Invoke-RestMethod -Uri "https://claracore-backend.azurewebsites.net/mantenimiento" -Method POST -Body $body -ContentType "application/json" | Out-Null
    Write-Host "Modo mantenimiento activado. Esperando 25 segundos..." -ForegroundColor Yellow
    Start-Sleep -Seconds 25
} catch {
    Write-Host "No se pudo activar mantenimiento (backend offline?). Continuando..." -ForegroundColor DarkYellow
}

Write-Host "Deployando backend..." -ForegroundColor Cyan
Compress-Archive -Path * -DestinationPath ../deploy.zip -Force
az webapp deploy --name claracore-backend --resource-group andres_jaimes82_rg_5760 --src-path ../deploy.zip --type zip
Remove-Item ../deploy.zip -Force

Write-Host "Deploy completado!" -ForegroundColor Green
