param(
    [string]$msg = "Actualizacion ClaraCore",
    [switch]$Deploy,
    [switch]$SkipBuild
)

# Escritorio: build local + commit SOLO frontend + push fiable a main.
# Delega en scripts/Deploy-ClaraCoreMain.ps1 (fetch, merge a main, pull --rebase, push).

$ErrorActionPreference = "Stop"
$frontendRoot = $PSScriptRoot
$repoRoot = Split-Path -Parent $frontendRoot
. (Join-Path $repoRoot "scripts/Deploy-ClaraCoreMain.ps1")

Write-Host "ADVERTENCIA: este comando despliega frontend a PRODUCCION (push main)." -ForegroundColor Yellow
$confirm = if ($Deploy) { "DEPLOY" } else {
    Read-Host "Escribe DEPLOY para continuar (o Enter para cancelar)"
}
if ($confirm -ne "DEPLOY") {
    Write-Host "Deploy cancelado por seguridad." -ForegroundColor DarkYellow
    exit 1
}

if (-not $SkipBuild) {
    Write-Host "Construyendo frontend..." -ForegroundColor Cyan
    Set-Location $frontendRoot
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERROR en build. Deploy cancelado." -ForegroundColor Red
        exit 1
    }
}

Invoke-ClaraCorePushMain -CommitMessage $msg -Scope Frontend -RepoRoot $repoRoot
Write-Host "Deploy frontend encolado (Azure Static Web Apps vía GitHub Actions)." -ForegroundColor Green
