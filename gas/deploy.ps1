# Deploy GAS backend (requires clasp login)
# Run: .\gas\deploy.ps1
# หลังรันครั้งแรก ต้อง Deploy Web app ใน Script Editor — ดู gas/DEPLOY.md

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$gas = Join-Path $repo 'gas'

Push-Location $gas
try {
  Write-Host 'Pushing Code.gs + appsscript.json...'
  clasp push --force
  Write-Host 'Creating script version + deployment...'
  node deploy-webapp.mjs
  Write-Host ''
  Write-Host 'ถ้า URL ยัง 404: เปิด gas/DEPLOY.md แล้ว Deploy Web app ในเบราว์เซอร์ (ครั้งเดียว)'
} finally {
  Pop-Location
}
