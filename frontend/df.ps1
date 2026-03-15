param([string]$msg = "Actualizacion ClaraCore")

Write-Host "Construyendo frontend..." -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: El build falló. Deploy cancelado." -ForegroundColor Red
    exit 1
}

Set-Location ..
git add .
git commit -m $msg
git push origin main
Set-Location frontend
Write-Host "ClaraCore actualizado en Azure!" -ForegroundColor Green