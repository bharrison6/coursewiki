$ErrorActionPreference = 'Stop'
$codeRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('coursewiki-markers-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory $fixture
foreach ($name in 'build-site.ps1','site.conf','scripts','collections','practice','tracks','theme','media','assets','interactives','activities') {
  Copy-Item -LiteralPath (Join-Path $codeRoot $name) -Destination $fixture -Recurse
}
$checks = 0
function Assert([bool]$condition, [string]$message) {
  if (-not $condition) { throw $message }
  $script:checks++; Write-Output "ok $script:checks - $message"
}
$parts = @{
  stop = '<div class="stop">Alpha</div>'
  watch = '<div class="gate">Beta</div>'
  interactive = '<div data-interactive="view-projection">Gamma</div>'
  checklist = '<ul class="boxes"><li>Delta</li></ul>'
  practice = '<a href="../practice.html#section-match-cut">Epsilon</a>'
}
$cases = @('stop','watch','interactive','checklist','practice','stop,interactive','interactive,checklist,practice','')
$pageFile = Join-Path $fixture 'collections/engineering-graphics/pages/assembly-files-and-mates.html'
for ($i=0; $i -lt $cases.Count; $i++) {
  $body = ($cases[$i].Split(',') | ForEach-Object { $parts[$_] }) -join ''
  [IO.File]::AppendAllText($pageFile, "`n<section><h2>Probe $i</h2>$body</section>")
}
# Compare actual output from the lane's unchanged base, including aggregate ids.
$builder = Join-Path $fixture 'build-site.ps1'
$currentBuilder = [IO.File]::ReadAllText($builder)
$baseBuilder = & git -C $codeRoot show HEAD:build-site.ps1
if ($LASTEXITCODE) { throw 'Cannot read base builder for id regression check' }
function Read-CardIds {
  @(Get-ChildItem (Join-Path $fixture 'docs') -Recurse -Filter *.html | ForEach-Object {
    $relative = [IO.Path]::GetRelativePath((Join-Path $fixture 'docs'), $_.FullName)
    foreach ($match in [regex]::Matches([IO.File]::ReadAllText($_.FullName), '<details class="xcard[^>]*\bid="([^"]+)"')) {
      "$relative|$($match.Groups[1].Value)"
    }
  } | Sort-Object)
}
try {
  [IO.File]::WriteAllText($builder, ($baseBuilder -join "`n"))
  & pwsh -NoProfile -File $builder -Prune *> (Join-Path $fixture 'base-build.log')
  Assert ($LASTEXITCODE -eq 0) 'base build succeeds with the same fixtures'
  $baseIds = Read-CardIds
} finally { [IO.File]::WriteAllText($builder, $currentBuilder) }
. (Join-Path $fixture 'build-site.ps1') -Prune *> (Join-Path $fixture 'build.log')
Assert (@(Compare-Object $baseIds (Read-CardIds)).Count -eq 0) 'all card ids match base build, including aggregates'
$html = [IO.File]::ReadAllText((Join-Path $fixture 'docs/engineering-graphics/assembly-files-and-mates.html'))
$rows = (New-SearchIndex 'site') -replace '^window.SEARCH_INDEX = ', '' -replace ';\s*$', '' | ConvertFrom-Json
for ($i=0; $i -lt $cases.Count; $i++) {
  $card = [regex]::Match($html, '(?s)<details[^>]*id="probe-' + $i + '".*?</details>').Value
  Assert ($card.Length -gt 0) "fixture $i retains title-only slug"
  $actual = @([regex]::Matches($card, 'data-marker="([^"]+)"') | ForEach-Object { $_.Groups[1].Value })
  Assert (($actual -join ',') -ceq $cases[$i]) "fixture $i labels in category order, including empty control"
  foreach ($category in $actual) {
    $label = @{ stop='Stop'; watch='Watch out'; interactive='Interactive'; checklist='Checklist'; practice='Practice' }[$category]
    Assert ($card.Contains('</span>' + $label + '</span>')) "fixture $i exact $category label text"
  }
  $edge = @($cases[$i].Split(',') | Where-Object { $_ -and $_ -ne 'practice' })
  if ($edge.Count) {
    Assert ($card.Contains('data-card-edge="' + $edge[0] + '"')) "fixture $i highest precedence edge"
  } else { Assert ($card -notmatch 'data-card-edge|--card-marker') "fixture $i no edge" }
  $row = @($rows | Where-Object title -eq "Probe $i")
  Assert ($row.Count -eq 1 -and $row[0].text -notmatch '(?i)stop|watch out|interactive|checklist|practice') "fixture $i generated tags excluded from search"
}
foreach ($c in $collections.Values) {
  $index = [IO.File]::ReadAllText((Join-Path $fixture "docs/$($c.Id)/index.html"))
  Assert ($index.Contains('aria-label="Card markers"')) "$($c.Id) has legend"
  foreach ($m in $script:cardMarkers) {
    Assert ($index.Contains('<strong>' + $m.Label + '</strong>: ' + (ConvertTo-HtmlText $m.Meaning))) "$($c.Id) legend has $($m.Id) meaning"
  }
}
$css = [IO.File]::ReadAllText((Join-Path $fixture 'theme/app.css'))
Assert ($css -match '\.presenting \.card-tags\s*\{\s*display: none') 'presentation hides labels'
Assert ($css -match 'main figure, \[data-interactive\]\s*\{ break-inside: avoid; \}') 'print protects figure and mount without fixed heights'
Write-Output "$checks checks passed; fixture retained at $fixture"
