# Topic modules use the same source assets on site pages and standalone aggregates.
# Dot-sourced by build-site.ps1 after its configuration reader is defined.
function Initialize-InteractiveAssets([string]$sourceRoot) {
  $script:interactiveModules = [ordered]@{}
  $script:interactiveStampParts = @()
  $activityRoot = Join-Path $sourceRoot 'activities'
  if (Test-Path -LiteralPath $activityRoot) {
    $activityJson = & node (Join-Path $sourceRoot 'scripts/read-activities.cjs') $activityRoot
    if ($LASTEXITCODE -ne 0) { throw 'activity manifests or canonical guides failed validation' }
    foreach ($activity in @($activityJson | ConvertFrom-Json)) {
      $activityDir = Join-Path $activityRoot $activity.id
      $script:interactiveModules[$activity.id] = [pscustomobject]@{
        Id = $activity.id; Root = $activityDir; CSS = @(); JS = @(); Requires = @()
        Document = $activity
      }
      $script:interactiveStampParts += ($activity | ConvertTo-Json -Depth 5 -Compress)
      foreach ($file in $activity.files) {
        $script:interactiveStampParts += [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $activityDir $file)))
      }
    }
  }
  $moduleRoot = Join-Path $sourceRoot 'interactives'
  if (-not (Test-Path -LiteralPath $moduleRoot)) { return }
  foreach ($dir in (Get-ChildItem -LiteralPath $moduleRoot -Directory | Sort-Object Name)) {
    $manifest = Read-Conf (Join-Path $dir.FullName 'interactive.conf')
    $id = [string]$manifest.Meta.ID
    if ($script:interactiveModules.Contains($id)) { throw "duplicate interactive identity across activities and modules: $id" }
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
    if (-not $assets.JS.Count) { throw "interactive $id needs @@JS assets" }
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
      Id = $id; Root = $dir.FullName; CSS = $assets.CSS; JS = $assets.JS; Requires = $requires; Document = $null
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
    if ($kind -eq 'CSS' -and $module.Document) { '<style>' + $module.Document.css + '</style>' }
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
    if ($kind -eq 'CSS' -and $module.Document) { $module.Document.css }
    foreach ($name in $module.$kind) {
      [IO.File]::ReadAllText((Join-Path $module.Root $name))
    }
  }
}

function Copy-InteractiveAssets([string]$outputRoot) {
  foreach ($module in $script:interactiveModules.Values) {
    if ($module.Document) {
      foreach ($name in $module.Document.files) {
        Write-OutBytes (Join-Path $outputRoot "activities/$($module.Id)/$name") `
          ([IO.File]::ReadAllBytes((Join-Path $module.Root $name)))
      }
    }
    foreach ($name in @($module.CSS) + @($module.JS)) {
      Write-Out (Join-Path $outputRoot "interactives/$($module.Id)/$name") `
        ([IO.File]::ReadAllText((Join-Path $module.Root $name)))
    }
  }
}

function Expand-ActivityNotes([string]$html) {
  [regex]::Replace($html, '<div data-activity-notes="([a-z][a-z0-9-]*)"></div>', {
    param($match)
    $id = $match.Groups[1].Value
    if (-not $script:interactiveModules.Contains($id) -or -not $script:interactiveModules[$id].Document) {
      throw "unknown document activity notes: $id"
    }
    $script:interactiveModules[$id].Document.notes
  })
}

function Expand-ActivityDocuments([string]$html, $context, [string]$mode) {
  [regex]::Replace($html, '<div data-interactive="([a-z][a-z0-9-]*)" data-activity></div>', {
    param($match)
    $id = $match.Groups[1].Value
    if (-not $script:interactiveModules.Contains($id) -or -not $script:interactiveModules[$id].Document) {
      throw "unknown document activity: $id"
    }
    $module = $script:interactiveModules[$id]
    $activity = $module.Document
    $up = if ($mode -eq 'aggregate') { $script:siteUrl + '/' } else { $context.Up }
    $baseUrl = "${up}activities/$id/"
    $title = [Net.WebUtility]::HtmlEncode($activity.title)
    $src = 'src="' + $baseUrl + $activity.entry + '?v=' + $script:stamp + '"'
    if ($mode -eq 'aggregate') {
      $document = [IO.File]::ReadAllText((Join-Path $module.Root $activity.entry))
      # Guide links inside an offline activity must also stay in the file.
      foreach ($name in @($activity.guideHtml, $activity.guidePdf)) {
        $mime = if ($name.EndsWith('.pdf')) { 'application/pdf' } else { 'text/html;charset=utf-8' }
        $uri = 'data:' + $mime + ';base64,' + [Convert]::ToBase64String([IO.File]::ReadAllBytes((Join-Path $module.Root $name)))
        $document = $document.Replace('href="' + $name + '"', 'href="' + $uri + '"')
      }
      $src = 'srcdoc="' + [Net.WebUtility]::HtmlEncode($document) + '"'
    }
    '<div data-interactive="' + $id + '" class="document-activity">' +
      '<p class="activity-links"><a class="button" target="_blank" rel="noopener" href="' + $baseUrl + $activity.entry + '">Open ' + $title + ' full screen</a> ' +
      '<a href="' + $baseUrl + $activity.guideHtml + '">Printable guide</a> · ' +
      '<a href="' + $baseUrl + $activity.guidePdf + '">Guide PDF</a></p>' +
      '<iframe title="' + $title + ' interactive activity" loading="lazy" allow="fullscreen" ' + $src + '></iframe></div>'
  })
}
