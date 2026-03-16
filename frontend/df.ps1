param([string]$msg = "Actualizacion ClaraCore")

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