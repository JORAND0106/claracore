param(
    [string]$msg = "Actualizacion ClaraCore",
    [switch]$Deploy
)

# Escritorio: build local + commit SOLO de frontend + push a main.
# El push dispara Azure Static Web Apps (mismo workflow que usa el flujo iPad).
# No usar `git add .` en la raiz: eso mezclaba WIP de backend/iPad y rompia el flujo de escritorio.

$ErrorActionPreference = "Continue"
$frontendRoot = $PSScriptRoot
$repoRoot = Split-Path -Parent $frontendRoot

Write-Host "ADVERTENCIA: este comando despliega a PRODUCCION." -ForegroundColor Yellow
$confirm = if ($Deploy) {
    "DEPLOY"
} else {
    Read-Host "Escribe DEPLOY para continuar (o Enter para cancelar)"
}
if ($confirm -ne "DEPLOY") {
    Write-Host "Deploy cancelado por seguridad." -ForegroundColor DarkYellow
    exit 1
}

Write-Host "Construyendo frontend..." -ForegroundColor Cyan
Set-Location $frontendRoot
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR en build. Deploy cancelado." -ForegroundColor Red
    exit 1
}

Write-Host "Preparando commit solo de frontend (sin tocar backend ni WIP de otras carpetas)..." -ForegroundColor Cyan
Set-Location $repoRoot
git add -- "frontend"
git restore --staged -- "frontend/.env" "frontend/.env.local" 2>$null

$frontendStatus = git status --porcelain -- "frontend"
if (-not $frontendStatus) {
    Write-Host "No hay cambios de frontend para commitear." -ForegroundColor DarkYellow
} else {
    Write-Host $frontendStatus
    git commit -m $msg
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR: git commit fallo." -ForegroundColor Red
        exit 1
    }
}

Write-Host "Subiendo a GitHub (main)..." -ForegroundColor Cyan
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: git push fallo." -ForegroundColor Red
    exit 1
}

Write-Host "Deploy completado. Azure Static Web Apps tomara el push (flujo iPad intacto)." -ForegroundColor Green
