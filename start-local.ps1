$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeModulesPath = Join-Path $repoRoot "node_modules"
$apiVenvPath = Join-Path $repoRoot "apps\\api\\venv"

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error "Node.js was not found. Install Node.js 18+ and rerun .\start-local.ps1."
  exit 1
}

$npm = Get-Command npm -ErrorAction SilentlyContinue
if (-not $npm) {
  Write-Error "npm was not found. Install npm with Node.js and rerun .\start-local.ps1."
  exit 1
}

if (-not (Test-Path $nodeModulesPath)) {
  Write-Error "Root npm dependencies are missing. Run `npm install` from the repository root, then rerun .\start-local.ps1."
  exit 1
}

if (-not (Test-Path $apiVenvPath)) {
  Write-Error "API virtual environment is missing at apps/api/venv. Create it and install apps/api/requirements.txt before rerunning .\start-local.ps1."
  exit 1
}

Push-Location $repoRoot
& npm run app
$exitCode = $LASTEXITCODE
Pop-Location
exit $exitCode
