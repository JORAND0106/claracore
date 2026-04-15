param([string]$msg = "Actualizacion ClaraCore")
Write-Host "ADVERTENCIA: este comando hace push a la rama principal." -ForegroundColor Yellow
$confirm = Read-Host "Escribe DEPLOY para continuar (o Enter para cancelar)"
if ($confirm -ne "DEPLOY") {
    Write-Host "Proceso cancelado por seguridad." -ForegroundColor DarkYellow
    exit 1
}
git add .
git commit -m $msg
git push origin main
Write-Host "ClaraCore actualizado en Azure!" -ForegroundColor Green