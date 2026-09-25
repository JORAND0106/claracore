# Funciones compartidas: df.ps1 (raíz) y frontend/df.ps1
# Objetivo: siempre publicar en origin/main con fetch + pull/rebase + merge desde rama actual.

function Test-GitCommandSuccess {
    param(
        [string]$Step,
        [int]$Code = $LASTEXITCODE
    )
    if ($Code -ne 0) {
        Write-Host "ERROR en: $Step (código $Code)." -ForegroundColor Red
        exit $Code
    }
}

function Get-ClaraCoreRepoRoot {
    param([string]$StartDir)
    $dir = $StartDir
    while ($dir) {
        if (Test-Path (Join-Path $dir ".git")) { return $dir }
        $parent = Split-Path -Parent $dir
        if (-not $parent -or $parent -eq $dir) { break }
        $dir = $parent
    }
    throw "No se encontró la raíz del repositorio ClaraCore (.git)."
}

function Remove-GitStagedIfTracked {
    param([string[]]$Paths)
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'SilentlyContinue'
    foreach ($p in $Paths) {
        $listed = @(git ls-files -- $p 2>$null)
        if ($listed.Count -gt 0) {
            git restore --staged -- $p 2>$null | Out-Null
        }
    }
    $ErrorActionPreference = $prevEap
    $global:LASTEXITCODE = 0
}

function Add-ClaraCoreDeployPaths {
    param(
        [ValidateSet('Full', 'Frontend')]
        [string]$Scope,
        [string]$RepoRoot
    )

    Set-Location $RepoRoot

    if ($Scope -eq 'Frontend') {
        git add -- "frontend"
        Remove-GitStagedIfTracked @("frontend/.env", "frontend/.env.local")
        return
    }

    git add -- backend frontend .github df.ps1 frontend/df.ps1 backend/db.ps1 scripts
    Remove-GitStagedIfTracked @("backend/.env", "frontend/.env", "frontend/.env.local")
    Remove-GitStagedIfTracked @("backend/__pycache__")
    git reset HEAD -- "backend/__pycache__" 2>$null | Out-Null
    $global:LASTEXITCODE = 0
}

function Invoke-ClaraCorePushMain {
    param(
        [Parameter(Mandatory = $true)]
        [string]$CommitMessage,
        [ValidateSet('Full', 'Frontend')]
        [string]$Scope = 'Full',
        [string]$RepoRoot
    )

    if (-not $RepoRoot) {
        $RepoRoot = Get-ClaraCoreRepoRoot -StartDir $PSScriptRoot
    }

    Set-Location $RepoRoot

    Write-Host "Sincronizando con origin..." -ForegroundColor Cyan
    git fetch origin
    Test-GitCommandSuccess -Step "git fetch origin"

    $sourceBranch = (git branch --show-current).Trim()
    if (-not $sourceBranch) {
        Write-Host "ERROR: no hay rama Git activa (¿detached HEAD?)." -ForegroundColor Red
        exit 1
    }

    Write-Host "Preparando commit (alcance: $Scope)..." -ForegroundColor Cyan
    Add-ClaraCoreDeployPaths -Scope $Scope -RepoRoot $RepoRoot

    $porcelain = git status --porcelain
    if ($Scope -eq 'Frontend') {
        $porcelain = git status --porcelain -- "frontend"
    }

    if ($porcelain) {
        Write-Host $porcelain
        git commit -m $CommitMessage
        Test-GitCommandSuccess -Step "git commit"
    } else {
        Write-Host "Sin cambios nuevos para commitear en alcance $Scope." -ForegroundColor DarkYellow
    }

    if ($sourceBranch -ne 'main') {
        Write-Host "Rama actual: '$sourceBranch'. Integrando en main antes del push..." -ForegroundColor Yellow
        git checkout main
        Test-GitCommandSuccess -Step "git checkout main"

        git pull --rebase origin main
        Test-GitCommandSuccess -Step "git pull --rebase origin main"

        git merge $sourceBranch --no-edit
        Test-GitCommandSuccess -Step "git merge $sourceBranch"
    } else {
        git pull --rebase origin main
        Test-GitCommandSuccess -Step "git pull --rebase origin main"
    }

    Write-Host "Publicando origin/main (dispara Azure SWA + workflows backend)..." -ForegroundColor Cyan
    git push origin main
    Test-GitCommandSuccess -Step "git push origin main"

    Write-Host "Push a main completado. GitHub Actions desplegará frontend/backend según los archivos cambiados." -ForegroundColor Green
}
