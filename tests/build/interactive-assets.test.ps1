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

# Two consumers share one dependency, which itself has a dependency.
function New-ProbeModule([string]$id, [string]$requires = '') {
  $dir = Join-Path $fixture "interactives/$id"
  $null = [IO.Directory]::CreateDirectory($dir)
  $conf = "@@ID: $id`n@@CSS: demo.css`n@@JS: model.js, demo.js`n@@REQUIRES: $requires`n@@END`n"
  [IO.File]::WriteAllText((Join-Path $dir 'interactive.conf'), $conf)
  [IO.File]::WriteAllText((Join-Path $dir 'demo.css'), ".$id { color: var(--ink); }")
  [IO.File]::WriteAllText((Join-Path $dir 'model.js'), "window.${id}Model = {};")
  [IO.File]::WriteAllText((Join-Path $dir 'demo.js'), "window.${id}Ready = true;")
}
New-ProbeModule 'core'
New-ProbeModule 'shared' 'core'
New-ProbeModule 'probe' 'shared'
New-ProbeModule 'sibling' 'shared'
Initialize-InteractiveAssets $fixture
$both = '<div data-interactive="probe"></div><div data-interactive="sibling"></div>'
$order = @(Get-InteractiveIds $both)
Assert (($order -join ',') -ceq 'core,shared,probe,sibling') 'dependency order is stable and a shared module appears once'
$web = @(Get-InteractiveWebAssets $both '../' 'JS')
Assert ($web.Count -eq 8 -and $web[0] -match '/core/model.js' -and $web[2] -match '/shared/model.js' -and $web[4] -match '/probe/model.js') 'web dependencies load before both consumers'
$inline = @(Get-InteractiveInlineAssets $both 'JS') -join "`n"
Assert ([regex]::Matches($inline, 'window.sharedReady').Count -eq 1) 'aggregate inlines a shared dependency once'
$dependencyStamp = $script:interactiveStampParts -join "`n"
New-ProbeModule 'probe' 'shared,core'
Initialize-InteractiveAssets $fixture
Assert (($script:interactiveStampParts -join "`n") -ne $dependencyStamp) 'dependency declarations participate in the cache stamp'
New-ProbeModule 'probe' 'missing'
Assert (Refuses { Initialize-InteractiveAssets $fixture } 'unknown') 'missing dependencies fail before generation'
New-ProbeModule 'probe' 'Shared'
Assert (Refuses { Initialize-InteractiveAssets $fixture } 'invalid|wrong-case') 'dependency casing is checked'
New-ProbeModule 'probe' 'shared,shared'
Assert (Refuses { Initialize-InteractiveAssets $fixture } 'duplicate') 'duplicate dependency declarations fail'
New-ProbeModule 'probe' 'shared'
New-ProbeModule 'core' 'probe'
Assert (Refuses { Initialize-InteractiveAssets $fixture } 'dependency cycle') 'transitive dependency cycles fail'
New-ProbeModule 'core'
New-ProbeModule 'probe' 'probe'
Assert (Refuses { Initialize-InteractiveAssets $fixture } 'dependency cycle') 'self-dependencies fail'
Write-Output "$script:checks checks passed; synthetic fixture retained at $fixture"

# A standalone document and an inline module cannot silently shadow each other.
New-ProbeModule 'probe'
$null = [IO.Directory]::CreateDirectory((Join-Path $fixture 'activities'))
$null = [IO.Directory]::CreateDirectory((Join-Path $fixture 'scripts'))
$documentReader = 'process.stdout.write(JSON.stringify([{id:"probe",title:"Synthetic activity",files:[],css:"",notes:""}]));'
[IO.File]::WriteAllText((Join-Path $fixture 'scripts/read-activities.cjs'), $documentReader)
Assert (Refuses { Initialize-InteractiveAssets $fixture } 'duplicate interactive identity') 'standalone documents and inline modules cannot share an identity'
Write-Output "$script:checks checks passed; fixtures are synthetic and retained"
