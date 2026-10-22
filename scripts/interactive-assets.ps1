# Topic modules use the same source assets on site pages and standalone aggregates.
# Dot-sourced by build-site.ps1 after its configuration reader is defined.
function Initialize-InteractiveAssets([string]$sourceRoot) {
  $script:interactiveModules = [ordered]@{}
  $script:interactiveStampParts = @()
  $moduleRoot = Join-Path $sourceRoot 'interactives'
  if (-not (Test-Path -LiteralPath $moduleRoot)) { return }
  foreach ($dir in (Get-ChildItem -LiteralPath $moduleRoot -Directory | Sort-Object Name)) {
    $manifest = Read-Conf (Join-Path $dir.FullName 'interactive.conf')
    $id = [string]$manifest.Meta.ID
    if ($id -cnotmatch '^[a-z][a-z0-9-]*$' -or $id -cne $dir.Name) {
      throw "interactive folder and @@ID must match exactly: $($dir.Name)"
    }
    $assets = @{ CSS = @(); JS = @() }
    foreach ($kind in @('CSS', 'JS')) {
      foreach ($name in ([string]$manifest.Meta[$kind] -split ',')) {
        $name = $name.Trim()
        if (-not $name) { continue }
        $ext = if ($kind -eq 'CSS') { 'css' } else { 'js' }
        if ($name -cnotmatch ('^[a-zA-Z0-9][a-zA-Z0-9._-]*\.' + $ext + '$')) {
          throw "invalid $kind asset name in interactive ${id}: $name"
        }
        $exactNames = @(Get-ChildItem -LiteralPath $dir.FullName -File | ForEach-Object Name)
        if ($exactNames -cnotcontains $name) { throw "missing or wrong-case interactive asset: $id/$name" }
        if ($assets[$kind] -contains $name) { throw "duplicate interactive asset: $id/$name" }
        $assets[$kind] += $name
        $script:interactiveStampParts += "$id/$name"
        $script:interactiveStampParts += [IO.File]::ReadAllText((Join-Path $dir.FullName $name))
      }
    }
    if (-not $assets.CSS.Count -or -not $assets.JS.Count) { throw "interactive $id needs @@CSS and @@JS assets" }
    $requires = @()
    foreach ($dependency in ([string]$manifest.Meta.REQUIRES -split ',')) {
      $dependency = $dependency.Trim()
      if (-not $dependency) { continue }
      if ($dependency -cnotmatch '^[a-z][a-z0-9-]*$') { throw "invalid interactive dependency in ${id}: $dependency" }
      if ($requires -contains $dependency) { throw "duplicate interactive dependency in ${id}: $dependency" }
      $requires += $dependency
    }
    $script:interactiveStampParts += "module:${id}:requires:$($requires -join ',')"
    $script:interactiveModules[$id] = [pscustomobject]@{
      Id = $id; Root = $dir.FullName; CSS = $assets.CSS; JS = $assets.JS; Requires = $requires
    }
  }
  # Validate even unused declarations before any generated output is written.
  $null = @(Resolve-InteractiveModuleOrder @($script:interactiveModules.Keys))
}

function Resolve-InteractiveModuleOrder([string[]]$ids) {
  $complete = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $visiting = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $ordered = [Collections.Generic.List[string]]::new()
  $visit = {
    param([string]$id, [string[]]$chain)
    if (@($script:interactiveModules.Keys) -cnotcontains $id) { throw "unknown or wrong-case interactive module: $id" }
    if ($complete.Contains($id)) { return }
    if (-not $visiting.Add($id)) { throw "interactive dependency cycle: $( (@($chain) + $id) -join ' -> ' )" }
    foreach ($dependency in $script:interactiveModules[$id].Requires) {
      & $visit $dependency @(@($chain) + $id)
    }
    [void]$visiting.Remove($id)
    [void]$complete.Add($id)
    $ordered.Add($id)
  }
  foreach ($id in $ids) { & $visit $id @() }
  $ordered.ToArray()
}

function Get-InteractiveIds([string]$html) {
  # Comments are authoring placeholders, just as in Resolve-Links.
  $visible = [regex]::Replace($html, '(?s)<!--.*?-->', '')
  $seen = [Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
  $roots = [Collections.Generic.List[string]]::new()
  foreach ($match in [regex]::Matches($visible, '\bdata-interactive\s*=\s*["'']([^"'']+)["'']')) {
    $id = $match.Groups[1].Value
    if ($seen.Add($id)) { $roots.Add($id) }
  }
  Resolve-InteractiveModuleOrder $roots.ToArray()
}

function Get-InteractiveWebAssets([string]$html, [string]$up, [string]$kind) {
  foreach ($id in @(Get-InteractiveIds $html)) {
    $module = $script:interactiveModules[$id]
    foreach ($name in $module.$kind) {
      $url = "${up}interactives/$id/${name}?v=$script:stamp"
      if ($kind -eq 'CSS') { '<link rel="stylesheet" href="' + $url + '">' }
      else { '<script src="' + $url + '"></script>' }
    }
  }
}

function Get-InteractiveInlineAssets([string]$html, [string]$kind) {
  foreach ($id in @(Get-InteractiveIds $html)) {
    $module = $script:interactiveModules[$id]
    foreach ($name in $module.$kind) {
      [IO.File]::ReadAllText((Join-Path $module.Root $name))
    }
  }
}

function Copy-InteractiveAssets([string]$outputRoot) {
  foreach ($module in $script:interactiveModules.Values) {
    foreach ($name in @($module.CSS) + @($module.JS)) {
      Write-Out (Join-Path $outputRoot "interactives/$($module.Id)/$name") `
        ([IO.File]::ReadAllText((Join-Path $module.Root $name)))
    }
  }
}
