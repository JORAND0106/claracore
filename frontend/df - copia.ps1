param([string]$msg = "Actualizacion ClaraCore")
git add .
git commit -m $msg
git push origin main
Write-Host "ClaraCore actualizado en Azure!" -ForegroundColor Green