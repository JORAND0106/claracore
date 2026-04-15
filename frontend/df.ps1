param([string]$msg = "Actualizacion ClaraCore")

Write-Host "ADVERTENCIA: este comando despliega a PRODUCCION." -ForegroundColor Yellow
$confirm = Read-Host "Escribe DEPLOY para continuar (o Enter para cancelar)"
if ($confirm -ne "DEPLOY") {
    Write-Host "Deploy cancelado por seguridad." -ForegroundColor DarkYellow
    exit 1
}

Write-Host "Construyendo frontend..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR en build. Deploy cancelado." -ForegroundColor Red
    exit 1
}

Write-Host "Subiendo a GitHub..." -ForegroundColor Cyan
Set-Location ..
git add .
git commit -m $msg
git push origin main

Write-Host "Deploy completado!" -ForegroundColor Green