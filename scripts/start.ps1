$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
if (-not (Test-Path '.env')) {
    $taskKey = & node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
    Copy-Item -LiteralPath '.env.example' -Destination '.env'
    $taskEnv = (Get-Content -LiteralPath '.env' -Raw).Replace('SETUP_KEY=', ('SETUP_KEY=' + $taskKey))
    Set-Content -LiteralPath '.env' -Value $taskEnv -NoNewline
}
if (-not (Test-Path 'node_modules')) { & npm install; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
if (-not (Test-Path 'dist')) { & npm run build; if ($LASTEXITCODE) { exit $LASTEXITCODE } }
# The app runs on the host here, while the optional document engine runs in Docker.
$env:OFFICE_INTERNAL_URL = 'http://localhost:8082'
$env:OFFICE_APP_URL = 'http://host.docker.internal:3001'
$env:HOST = '0.0.0.0'
& node --env-file=.env server/index.js
