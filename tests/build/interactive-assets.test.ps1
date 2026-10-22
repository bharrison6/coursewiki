$ErrorActionPreference = 'Stop'
$codeRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
. (Join-Path $codeRoot 'scripts/read-conf.ps1')
. (Join-Path $codeRoot 'scripts/interactive-assets.ps1')
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('acc-coursewiki-assets-' + [guid]::NewGuid().ToString('N'))
$moduleDir = Join-Path $fixture 'interactives/probe'
$null = [IO.Directory]::CreateDirectory($moduleDir)
$manifestPath = Join-Path $moduleDir 'interactive.conf'
$manifest = "@@ID: probe`n@@CSS: demo.css`n@@JS: model.js, demo.js`n@@END`n"
[IO.File]::WriteAllText($manifestPath, $manifest)
[IO.File]::WriteAllText((Join-Path $moduleDir 'demo.css'), '.probe { color: var(--ink); }')
[IO.File]::WriteAllText((Join-Path $moduleDir 'model.js'), 'window.probeModel = {};')
[IO.File]::WriteAllText((Join-Path $moduleDir 'demo.js'), 'window.probeReady = true;')
$script:checks = 0
function Assert([bool]$condition, [string]$message) {
  if (-not $condition) { throw $message }
  $script:checks++
  Write-Output "ok $script:checks - $message"
}
function Refuses([scriptblock]$action, [string]$pattern) {
  try { & $action | Out-Null } catch { return $_.Exception.Message -match $pattern }
  $false
}
Initialize-InteractiveAssets $fixture
$script:stamp = 'test-stamp'
$html = '<div data-interactive="probe"></div><div data-interactive="probe"></div>'
Assert (@(Get-InteractiveIds $html).Count -eq 1) 'multiple roots load one copy of each module asset'
$scripts = @(Get-InteractiveWebAssets $html '../' 'JS')
Assert ($scripts.Count -eq 2 -and $scripts[0] -match 'model.js\?v=test-stamp' -and $scripts[1] -match 'demo.js') 'web scripts preserve dependency order and build stamp'
Assert (@(Get-InteractiveWebAssets $html '../' 'CSS')[0] -match '../interactives/probe/demo.css') 'web asset uses the caller output depth'
$inline = @(Get-InteractiveInlineAssets $html 'JS') -join "`n"
Assert ($inline -eq "window.probeModel = {};`nwindow.probeReady = true;") 'aggregate inlines the same source scripts once and in order'
Assert (@(Get-InteractiveIds '<!-- <div data-interactive="missing"></div> -->').Count -eq 0) 'commented placeholders are not dependencies'
Assert (Refuses { Get-InteractiveIds '<div data-interactive="missing"></div>' } 'unknown') 'unknown root fails rather than silently dropping functionality'
Assert (Refuses { Get-InteractiveIds '<div data-interactive="Probe"></div>' } 'wrong-case') 'wrong-case root fails on Windows as it would on Pages'
$stampBefore = $script:interactiveStampParts -join "`n"
[IO.File]::WriteAllText((Join-Path $moduleDir 'demo.js'), 'window.probeReady = false;')
Initialize-InteractiveAssets $fixture
Assert (($script:interactiveStampParts -join "`n") -ne $stampBefore) 'editing only JavaScript changes the stamp input'
[IO.File]::WriteAllText($manifestPath, $manifest.Replace('demo.css', 'Demo.css'))
Assert (Refuses { Initialize-InteractiveAssets $fixture } 'wrong-case') 'wrong-case filename fails before output'
[IO.File]::WriteAllText($manifestPath, $manifest.Replace('model.js, demo.js', '../model.js, demo.js'))
Assert (Refuses { Initialize-InteractiveAssets $fixture } 'invalid') 'asset paths cannot leave their topic folder'
[IO.File]::WriteAllText($manifestPath, $manifest.Replace('model.js, demo.js', 'model.js, model.js'))
Assert (Refuses { Initialize-InteractiveAssets $fixture } 'duplicate') 'duplicate script declarations fail'
[IO.File]::WriteAllText($manifestPath, $manifest.Replace('@@ID: probe', '@@ID: other'))
Assert (Refuses { Initialize-InteractiveAssets $fixture } 'match exactly') 'manifest identity matches its folder'
Write-Output "$script:checks checks passed; synthetic fixture retained at $fixture"
