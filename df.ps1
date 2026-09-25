<#
.SYNOPSIS
  Despliegue a producción vía push a main (Azure Static Web Apps + GitHub Actions).

.DESCRIPTION
  - Hace fetch, integra la rama actual en main si no estás en main, pull --rebase y push.
  - Verifica códigos de salida (no muestra éxito si git push falla).
  - Backend en caliente: use backend/db.ps1 (az webapp deploy directo).

.PARAMETER msg
  Mensaje del commit.

.PARAMETER FrontendOnly
  Solo commitea frontend/ (equivalente a frontend/df.ps1 sin duplicar lógica de git).

.PARAMETER SkipBuild
  No ejecuta npm run build (CI en GitHub igual construye; útil si solo cambia backend).

.PARAMETER Deploy
  Omite la confirmación DEPLOY (automatización).

.EXAMPLE
  .\df.ps1 "fix presupuesto"
  .\df.ps1 -FrontendOnly "UI presupuesto"
#>
param(
    [string]$msg = "Actualizacion ClaraCore",
    [switch]$FrontendOnly,
    [switch]$SkipBuild,
    [switch]$Deploy
)

# Stop rompe con git stderr benigno; los fallos se validan con Test-GitCommandSuccess.
$ErrorActionPreference = "Continue"
$repoRoot = $PSScriptRoot
. (Join-Path $repoRoot "scripts/Deploy-ClaraCoreMain.ps1")

Write-Host "ADVERTENCIA: este comando hace push a la rama principal (produccion)." -ForegroundColor Yellow
$confirm = if ($Deploy) { "DEPLOY" } else {
    Read-Host "Escribe DEPLOY para continuar (o Enter para cancelar)"
}
if ($confirm -ne "DEPLOY") {
    Write-Host "Proceso cancelado por seguridad." -ForegroundColor DarkYellow
    exit 1
}

$scope = if ($FrontendOnly) { "Frontend" } else { "Full" }

if (-not $SkipBuild) {
    Write-Host "Validando build del frontend (npm run build)..." -ForegroundColor Cyan
    Push-Location (Join-Path $repoRoot "frontend")
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "ERROR: npm run build falló. Deploy cancelado." -ForegroundColor Red
            exit 1
        }
    } finally {
        Pop-Location
    }
}

Invoke-ClaraCorePushMain -CommitMessage $msg -Scope $scope -RepoRoot $repoRoot
