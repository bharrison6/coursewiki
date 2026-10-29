$ErrorActionPreference = 'Stop'
$codeRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('acc-coursewiki-navigation-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory $fixture
foreach ($name in 'build-site.ps1','site.conf','scripts','collections','practice','tracks','theme','media','assets','interactives','activities') {
  Copy-Item -LiteralPath (Join-Path $codeRoot $name) -Destination $fixture -Recurse
}

$script:checks = 0
function Assert([bool]$condition, [string]$message) {
  if (-not $condition) { throw $message }
  $script:checks++
  Write-Output "ok $script:checks - $message"
}
function Assert-Before([string]$text, [string]$first, [string]$second, [string]$message) {
  $a = $text.IndexOf($first, [StringComparison]::Ordinal)
  $b = $text.IndexOf($second, [StringComparison]::Ordinal)
  Assert ($a -ge 0 -and $b -ge 0 -and $a -lt $b) $message
}
function Add-Pin([string]$path, [string]$value) {
  $raw = [IO.File]::ReadAllText($path)
  if ($raw -match '(?m)^@@PIN:') { throw "fixture already has @@PIN: $path" }
  $updated = [regex]::Replace($raw, '(?m)^@@END\s*$', "@@PIN: $value`r`n@@END", 1)
  if ($updated -ceq $raw) { throw "could not add @@PIN to $path" }
  [IO.File]::WriteAllText($path, $updated)
}

# The pin is header metadata. Prove removing it changes none of the body without
# freezing future authorized Safety prose to a permanent hash.
$equipmentSource = Join-Path $codeRoot 'collections/safety/pages/equipment-categories.html'
$normalized = [IO.File]::ReadAllText($equipmentSource).Replace("`r`n", "`n")
$body = ($normalized -split '(?m)^@@END\s*$', 2)[1]
$withoutPin = [regex]::Replace($normalized, '(?m)^@@PIN:\s*true\s*\n', '')
$bodyWithoutPin = ($withoutPin -split '(?m)^@@END\s*$', 2)[1]
Assert ($body -ceq $bodyWithoutPin) 'Equipment Categories pin is header-only and leaves its body byte-identical'

. (Join-Path $codeRoot 'scripts/page-order.ps1')
$unPinned = @(
  [pscustomobject]@{ Id='z'; Title='Zulu'; Pin=$false }
  [pscustomobject]@{ Id='a'; Title='Alpha'; Pin=$false }
  [pscustomobject]@{ Id='f'; Title='Foxtrot'; Pin=$false }
)
$oldOrder = @($unPinned | Sort-Object Title | ForEach-Object Id)
$newOrder = @(Sort-GroupPages $unPinned | ForEach-Object Id)
Assert (($newOrder -join ',') -ceq ($oldOrder -join ',')) 'no-pin ordering is identical to the former alphabetical rule'
Assert ((ConvertTo-PagePin @{} 'missing.html') -eq $false) 'missing pin defaults false'
Assert ((ConvertTo-PagePin @{PIN='false'} 'false.html') -eq $false) 'explicit false stays unpinned'
Assert ((ConvertTo-PagePin @{PIN='TRUE'} 'true.html') -eq $true) 'true is accepted case-insensitively'
try { ConvertTo-PagePin @{PIN='first'} 'invalid.html'; throw 'invalid pin was accepted' }
catch { Assert ($_.Exception.Message -match '@@PIN must be true or false') 'invalid pin value is rejected by the shared parser' }
$tie = @(
  [pscustomobject]@{ Id='z'; Title='Zulu'; Pin=$true }
  [pscustomobject]@{ Id='a'; Title='Alpha'; Pin=$true }
  [pscustomobject]@{ Id='f'; Title='Foxtrot'; Pin=$false }
)
Assert (((Sort-GroupPages $tie | ForEach-Object Id) -join ',') -ceq 'a,z,f') 'multiple pins are alphabetical, followed by alphabetical ordinary pages'
$emptyGroup = @(Sort-GroupPages @())
$singleGroup = @(Sort-GroupPages @([pscustomobject]@{ Id='only'; Title='Only'; Pin=$false }))
Assert ($emptyGroup.Count -eq 0) 'empty group retains an empty-array contract under strict mode'
Assert ($singleGroup.Count -eq 1 -and $singleGroup[0].Id -eq 'only') 'single-page group retains a one-element array contract'

# Plant a pin in a different Safety group and an explicit false control. These
# edits live only in the retained temp fixture.
$conduct = Join-Path $fixture 'collections/safety/pages/conduct-and-emergency.html'
$ppe = Join-Path $fixture 'collections/safety/pages/ppe.html'
Add-Pin $conduct 'true'
Add-Pin $ppe 'false'
$safetyConf = Join-Path $fixture 'collections/safety/collection.conf'
$confRaw = [IO.File]::ReadAllText($safetyConf)
[IO.File]::WriteAllText($safetyConf, $confRaw.Replace('@@GROUPS: Universal Rules, Equipment', '@@GROUPS: Universal Rules, Empty Probe, Single Probe, Equipment'))
$singlePage = Join-Path $fixture 'collections/safety/pages/single-probe.html'
[IO.File]::WriteAllText($singlePage, "@@ID: single-probe`r`n@@TITLE: Single Probe`r`n@@SECTION: Single Probe`r`n@@SUMMARY: A retained fixture for one-page group ordering.`r`n@@STATUS: ready`r`n@@END`r`n`r`n<section><h2>Single fixture</h2><p>One page.</p></section>`r`n")

$log = Join-Path $fixture 'build.log'
& pwsh -NoProfile -File (Join-Path $fixture 'build-site.ps1') -Prune *> $log
Assert ($LASTEXITCODE -eq 0) 'full fixture build accepts true, false and default pin metadata'

$index = [IO.File]::ReadAllText((Join-Path $fixture 'docs/safety/index.html'))
$sidebar = [regex]::Match($index, '(?s)<aside class="sidebar".*?</aside>').Value
$main = $index.Substring($index.IndexOf('<main id="main">', [StringComparison]::Ordinal))
$mainUniversal = [regex]::Match($main, '(?s)<h2 class="section-head" id="g-safety-universal-rules".*?(?=<h2 class="section-head")').Value
$mainEquipment = [regex]::Match($main, '(?s)<h2 class="section-head" id="g-safety-equipment".*?(?=</div></main>)').Value
Assert-Before $sidebar 'data-nav="g-safety-universal-rules"' 'href="../safety/conduct-and-emergency.html"' 'sidebar keeps the Universal Rules group before its pages'
Assert-Before $sidebar 'href="../safety/conduct-and-emergency.html"' 'href="../safety/chemicals-and-sds.html"' 'generic pinned page leads its own sidebar group'
Assert-Before $sidebar 'href="../safety/chemicals-and-sds.html"' 'href="../safety/electrical-safety.html"' 'ordinary Universal Rules pages remain alphabetical after the pin'
Assert ($sidebar -notmatch 'g-safety-empty-probe') 'empty configured group emits no sidebar block'
Assert-Before $sidebar 'data-nav="g-safety-single-probe"' 'href="../safety/single-probe.html"' 'single-page sidebar group retains its page'
Assert-Before $sidebar 'data-nav="g-safety-equipment"' 'href="../safety/equipment-categories.html"' 'sidebar keeps the Equipment group boundary before its pages'
Assert-Before $sidebar 'href="../safety/equipment-categories.html"' 'href="../safety/axiom-cnc-router.html"' 'Equipment Categories is first in the sidebar Equipment group'
Assert-Before $sidebar 'href="../safety/axiom-cnc-router.html"' 'href="../safety/band-saw.html"' 'sidebar Equipment pages remain alphabetical after the pin'

Assert-Before $main 'id="g-safety-universal-rules"' 'href="conduct-and-emergency.html"' 'collection index keeps Universal Rules boundary'
Assert-Before $mainUniversal 'href="conduct-and-emergency.html"' 'href="chemicals-and-sds.html"' 'collection index uses the generic pin in another group'
Assert-Before $mainUniversal 'href="chemicals-and-sds.html"' 'href="electrical-safety.html"' 'collection index retains alphabetical ordinary pages'
Assert ($main -notmatch 'g-safety-empty-probe') 'empty configured group emits no collection block'
Assert-Before $main 'id="g-safety-single-probe"' 'href="single-probe.html"' 'single-page collection group retains its tile'
Assert-Before $main 'id="g-safety-single-probe"' 'id="g-safety-equipment"' 'collection index preserves configured group boundaries'
Assert ($mainEquipment.Contains('href="equipment-categories.html"')) 'collection Equipment block contains Equipment Categories'
Assert-Before $mainEquipment 'href="equipment-categories.html"' 'href="axiom-cnc-router.html"' 'Equipment Categories is first in collection tiles'
Assert-Before $mainEquipment 'href="axiom-cnc-router.html"' 'href="band-saw.html"' 'remaining Equipment tiles stay alphabetical'

$playlistText = [IO.File]::ReadAllText((Join-Path $fixture 'docs/playlists.js'))
$playlistJson = [regex]::Match($playlistText, '(?s)^window\.TRACKS\s*=\s*(\[.*\]);\s*$').Groups[1].Value
$playlists = $playlistJson | ConvertFrom-Json
$everything = @($playlists | Where-Object name -eq 'everything')[0]
$everythingIds = @($everything.items | ForEach-Object id)
function Item-Index([string[]]$items, [string]$id) { [Array]::IndexOf($items, $id) }
foreach ($id in 'conduct-and-emergency','chemicals-and-sds','equipment-categories','axiom-cnc-router','band-saw') {
  Assert ((Item-Index $everythingIds $id) -ge 0) "generated Everything data contains $id"
}
Assert ((Item-Index $everythingIds 'conduct-and-emergency') -lt (Item-Index $everythingIds 'chemicals-and-sds')) 'generated Everything data pins within Universal Rules'
Assert ((Item-Index $everythingIds 'chemicals-and-sds') -lt (Item-Index $everythingIds 'equipment-categories')) 'generated Everything data preserves group boundary'
Assert ((Item-Index $everythingIds 'equipment-categories') -lt (Item-Index $everythingIds 'axiom-cnc-router')) 'generated Everything data pins Equipment Categories'
Assert ((Item-Index $everythingIds 'axiom-cnc-router') -lt (Item-Index $everythingIds 'band-saw')) 'generated Everything data keeps remaining Equipment alphabetical'

foreach ($aggregateName in 'section-safety.html','track-everything.html') {
  $aggregate = [IO.File]::ReadAllText((Join-Path $fixture "docs/print/$aggregateName"))
  Assert-Before $aggregate 'id="p-conduct-and-emergency"' 'id="p-chemicals-and-sds"' "$aggregateName pins the generic Universal Rules fixture"
  Assert-Before $aggregate 'id="p-chemicals-and-sds"' 'id="p-equipment-categories"' "$aggregateName preserves the collection group boundary"
  Assert-Before $aggregate 'id="p-equipment-categories"' 'id="p-axiom-cnc-router"' "$aggregateName pins Equipment Categories"
  Assert-Before $aggregate 'id="p-axiom-cnc-router"' 'id="p-band-saw"' "$aggregateName keeps remaining Equipment alphabetical"
}

# A pinned page also belongs to an authored track. The track must keep file order.
$trackRaw = [IO.File]::ReadAllText((Join-Path $fixture 'tracks/general-safety.track'))
$trackBody = ($trackRaw -split '(?m)^@@END\s*$', 2)[1]
$expectedTrack = @($trackBody -split "`r?`n" | ForEach-Object { $_.Trim() } | Where-Object { $_ -and -not $_.StartsWith('#') -and -not $_.StartsWith('>') -and -not $_.StartsWith('+') })
$actualTrack = @((@($playlists | Where-Object name -eq 'general-safety')[0]).items | ForEach-Object id)
Assert (($actualTrack -join ',') -ceq ($expectedTrack -join ',')) 'authored General Safety track order is unchanged by page pins'

# Exercise the real build refusal, after the successful-output assertions.
$ppeRaw = [IO.File]::ReadAllText($ppe)
[IO.File]::WriteAllText($ppe, $ppeRaw.Replace('@@PIN: false', '@@PIN: first'))
$invalidLog = Join-Path $fixture 'invalid.log'
& pwsh -NoProfile -File (Join-Path $fixture 'build-site.ps1') -WhatIf *> $invalidLog
Assert ($LASTEXITCODE -ne 0) 'invalid pin fails the full build'
Assert ([IO.File]::ReadAllText($invalidLog).Contains('@@PIN must be true or false')) 'invalid build reports the pin contract'

Write-Output "$script:checks checks passed; fixture retained at $fixture"
