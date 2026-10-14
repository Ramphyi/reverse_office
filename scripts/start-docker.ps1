$ErrorActionPreference = 'Stop'
Set-Location (Split-Path -Parent $PSScriptRoot)
& node scripts/license-audit.mjs --check
if ($LASTEXITCODE) { throw 'Deployment blocked by the strict MIT/Apache-2.0 license policy. See docs/LICENSE-STATUS.md.' }
if (-not (Test-Path '.env')) { Copy-Item -LiteralPath '.env.example' -Destination '.env' }
$taskEnv = [IO.File]::ReadAllText((Join-Path (Get-Location) '.env'))
foreach ($keyName in @('SETUP_KEY', 'OFFICE_JWT_SECRET')) {
    $pattern = '(?m)^' + $keyName + '=([^\r\n]*)'
    $match = [regex]::Match($taskEnv, $pattern)
    if (-not $match.Success -or $match.Groups[1].Value.Length -lt 32) {
        $taskKey = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
        if ($match.Success) { $taskEnv = [regex]::Replace($taskEnv, $pattern, ($keyName + '=' + $taskKey)) }
        else { $taskEnv += "`n$keyName=$taskKey`n" }
    }
}
foreach ($setting in @('OFFICE_PUBLIC_URL=http://localhost:8082','OFFICE_INTERNAL_URL=http://documentserver','OFFICE_APP_URL=http://office:3001')) {
    $settingName = $setting.Split('=')[0]
    if ($taskEnv -notmatch ('(?m)^' + $settingName + '=')) { $taskEnv += "`n$setting`n" }
}
[IO.File]::WriteAllText((Join-Path (Get-Location) '.env'), $taskEnv)
& docker compose --profile editors up -d --build
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Write-Host 'Reverse Office: http://localhost:3001. Document editors: http://localhost:8082.'
Write-Host 'The first editor startup can take a few minutes. Your setup key is in the local .env file.'
