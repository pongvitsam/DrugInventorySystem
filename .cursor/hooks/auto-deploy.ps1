# Auto commit + push to trigger GitHub Pages deploy after agent edits.
$ErrorActionPreference = "SilentlyContinue"

$root = git rev-parse --show-toplevel 2>$null
if (-not $root) { exit 0 }
Set-Location $root

$porcelain = git status --porcelain 2>$null
if (-not $porcelain) { exit 0 }

git add css index.html js .github .cursor/hooks.json .cursor/hooks .cursor/rules 2>$null
git add -u css index.html js .github 2>$null

git reset HEAD -- .env .env.* credentials.json 2>$null

$staged = git diff --cached --name-only 2>$null
if (-not $staged) { exit 0 }

$branch = git rev-parse --abbrev-ref HEAD 2>$null
if (-not $branch) { $branch = "main" }

$msg = "Auto deploy $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
git commit -m $msg 2>$null
if ($LASTEXITCODE -ne 0) { exit 0 }

git push origin $branch 2>$null
exit 0
