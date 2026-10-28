$ErrorActionPreference = 'Stop'
$codeRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('coursewiki-links-' + [guid]::NewGuid().ToString('N'))
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
$log = Join-Path $fixture 'build.log'
. (Join-Path $fixture 'build-site.ps1') -Prune *> $log
$report = [IO.File]::ReadAllText($log)
Assert ($report -notmatch 'media\\ files no page references') 'all current media is referenced, including practice-only match-cut.svg'
Assert ($report -match 'understanding-artificial-intelligence.html:12 -> understanding-artificial-intelligence.html\?p=') 'presentation self-link is warned with source line'
$token = '[[collection:engineering-graphics|Browse & learn]]'
foreach ($coll in 'engineering-graphics','machining') {
  $resolved = Resolve-Links $token ([pscustomobject]@{ Coll = $coll; Up = '../' }) 'site-page'
  Assert ($resolved -match 'href="../engineering-graphics/index.html"' -and $resolved -match 'Browse &amp; learn') "collection resolves from $coll, including runtime track/presentation views"
}
$resolved = Resolve-Links '[[collection:engineering-graphics]]' ([pscustomobject]@{ Up = '' }) 'practice-page'
Assert ($resolved -match 'href="engineering-graphics/index.html"' -and $resolved.Contains($collections['engineering-graphics'].Title)) 'practice links use root depth and default title'
$resolved = Resolve-Links $token ([pscustomobject]@{ Ids = @('assembly-files-and-mates') }) 'aggregate'
Assert ($resolved.Contains('href="' + $SiteUrl + '/engineering-graphics/index.html"')) 'standalone aggregate links to published index'
Assert ((Resolve-Links '[[collection:missing-probe]]' $null 'site-page') -match 'xref-missing') 'unknown collection renders a missing reference'
Assert ((Resolve-Links '<!-- [[collection:missing-probe]] -->' $null 'site-page') -ceq '<!-- [[collection:missing-probe]] -->') 'comments stay literal'

# Plants live only in the throwaway copy, and are removed even on failure.
$page = Join-Path $fixture 'collections/engineering-graphics/pages/assembly-files-and-mates.html'
$intro = Join-Path $fixture 'collections/engineering-graphics/intro.html'
$bank = Join-Path $fixture 'practice/section-and-auxiliary-views.html'
$plant = Join-Path $fixture 'media/unused-probe.svg'
$originals = @{}
foreach ($file in $page,$intro,$bank) {
  $originals[$file] = if (Test-Path -LiteralPath $file) { [IO.File]::ReadAllText($file) } else { $null }
}
try {
  $probe = @'
<a href="index.html">raw index</a>
<a href='local.html'>single quoted</a><a href=bare.html>bare</a>
<a href="../practice.html#section-match-cut">safe practice</a>
<a href="#local">fragment</a><a href="/root">root</a><a href="mailto:test@example.org">mail</a>
<!-- <a href="comment-probe.html">comment</a> [[collection:comment-probe]] -->
<a data-href="data-probe.html">data attribute</a>
'@
  foreach ($file in $page,$intro,$bank) {
    [IO.File]::AppendAllText($file, "`n$probe`n<a href=`"$SiteUrl/engineering-graphics/index.html`">self site</a>`n<a href=`"${SiteUrl}-other/index.html`">other site</a>")
  }
  [IO.File]::AppendAllText($intro, "`n[[collection:missing-probe]]")
  [IO.File]::WriteAllText($plant, '<svg xmlns="http://www.w3.org/2000/svg"/>')
  & pwsh -NoProfile -File (Join-Path $fixture 'build-site.ps1') -Prune *> $log
  Assert ($LASTEXITCODE -eq 0) 'dangling collections, risky hrefs and unused media do not fail the build'
  $report = [IO.File]::ReadAllText($log)
  foreach ($file in $page,$intro,$bank) {
    $relative = [IO.Path]::GetRelativePath($fixture, $file)
    $line = 2 + [regex]::Matches($originals[$file], "`n").Count
    Assert ($report.Contains("${relative}:${line} -> index.html")) "raw index control names exact file and line: $relative"
  }
  Assert ($report -match '-> local.html' -and $report -match '-> bare.html') 'single-quoted and unquoted hrefs are warned'
  Assert ($report.Contains("-> $SiteUrl/engineering-graphics/index.html")) 'absolute self-site href is warned'
  Assert ($report -notmatch '-> (comment-probe|data-probe|\.\./practice|#local|/root|mailto:)' -and -not $report.Contains("-> ${SiteUrl}-other")) 'safe links, comments, data attributes and other sites are excluded'
  Assert ($report -match 'intro.html -> collection:missing-probe' -and $report -notmatch '-> collection:comment-probe') 'unknown collection is reported as dangling; comments ignored'
  Assert ($report -match 'media\\ files no page references \(1\): unused-probe.svg') 'unused media positive control is reported'
} finally {
  foreach ($file in $originals.Keys) {
    if ($null -eq $originals[$file]) { Remove-Item -LiteralPath $file -Force }
    else { [IO.File]::WriteAllText($file, $originals[$file]) }
  }
  Remove-Item -LiteralPath $plant -Force -ErrorAction SilentlyContinue
}
Write-Output "$script:checks checks passed; plants removed; fixture retained at $fixture"
