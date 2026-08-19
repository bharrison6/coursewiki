<#
    build-site.ps1 - render the DET site: landing page, collections, decks.

    THE MODEL
      A PAGE is one topic, authored once, as an @@FIELD: header plus a stack of
      <section> blocks. It lives in collections\<coll>\pages\<id>.html.

      A COLLECTION is a section of the site - safety, lean, and so on. It gets
      its own folder, its own landing page, its own URL, and its own bundle.

      A DECK is a manifest in decks\<name>.deck naming pages in order. Decks are
      SITE-level, not collection-level, because a presentation may pull from
      anywhere. Every <section> of every listed page becomes one slide; no slide
      content is authored twice.

      A LINK is [[page-id]] or [[page-id|text]]. Page ids are unique across the
      whole site, and the same source line resolves differently by container -
      see Resolve-Links for the five targets.

    OUTPUT
      docs\    the site. GitHub Pages serves this directly from main/docs with
               no CI. Relative links throughout, so it also opens from disk.
      bundle\  self-contained single files, CSS inlined, no siblings. For
               Canvas, Drive, email, a flash drive.

    Usage
      pwsh -File .\build-site.ps1
      pwsh -File .\build-site.ps1 -Bundle
      pwsh -File .\build-site.ps1 -Bundle -SiteUrl "https://example.org/det"
      pwsh -File .\build-site.ps1 -WhatIf
#>
[CmdletBinding()]
param(
  [switch] $Bundle,
  # Overrides @@SITEURL from site.conf. A bundle has no siblings, so links out
  # of it need an absolute base.
  [string] $SiteUrl,
  [switch] $WhatIf
)

$ErrorActionPreference = 'Stop'
$root     = $PSScriptRoot
$collDir  = Join-Path $root 'collections'
$deckDir  = Join-Path $root 'decks'
$themeDir = Join-Path $root 'theme'
$docsDir  = Join-Path $root 'docs'
$enc      = New-Object System.Text.UTF8Encoding($false)

# ---------------------------------------------------------------- helpers ----
function Read-Conf([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { throw "missing conf: $path" }
  $raw   = [System.IO.File]::ReadAllText($path)
  $split = $raw -split '(?m)^@@END\s*$', 2
  if ($split.Count -ne 2) { throw "$path : no @@END line closing the header" }
  $meta = @{}
  foreach ($line in ($split[0] -split "`r?`n")) {
    if ($line -match '^@@([A-Z]+):\s*(.*)$') { $meta[$Matches[1]] = $Matches[2].Trim() }
  }
  [pscustomobject]@{ Meta = $meta; Body = $split[1] }
}

function Get-DataUri([string]$relPath) {
  $p = Join-Path $root $relPath
  if (-not (Test-Path -LiteralPath $p)) { throw "missing asset: $p" }
  'data:image/png;base64,' + [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($p))
}

function Write-Out([string]$path, [string]$text) {
  $dir = Split-Path $path -Parent
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $name = $path.Substring($root.Length).TrimStart('\')
  $text = $text.Replace("`r`n", "`n")
  if ($WhatIf) {
    $state = if (-not (Test-Path -LiteralPath $path)) { 'would CREATE' }
             elseif ([System.IO.File]::ReadAllText($path) -eq $text) { 'unchanged' }
             else { 'would CHANGE' }
    Write-Host ("  {0,-46} {1}" -f $name, $state)
  } else {
    [System.IO.File]::WriteAllText($path, $text, $enc)
    Write-Host ("  {0,-46} {1:n0} bytes" -f $name, $enc.GetByteCount($text))
  }
}

function ConvertTo-HtmlText([string]$s) {
  $s.Replace('&','&amp;').Replace('<','&lt;').Replace('>','&gt;').Replace('"','&quot;')
}

# ------------------------------------------------------------------- site ----
$siteConf = Read-Conf (Join-Path $root 'site.conf')
$site = $siteConf.Meta
if (-not $SiteUrl) { $SiteUrl = $site.SITEURL }
$SiteUrl = $SiteUrl.TrimEnd('/')

$collOrder = @()
foreach ($line in ($siteConf.Body -split "`r?`n")) {
  $t = $line.Trim()
  if ($t -eq '' -or $t.StartsWith('#')) { continue }
  $collOrder += $t
}

# ------------------------------------------------------ collections + pages --
$pages       = [ordered]@{}   # id -> page
$collections = [ordered]@{}

foreach ($cid in $collOrder) {
  $cdir = Join-Path $collDir $cid
  if (-not (Test-Path -LiteralPath $cdir)) { throw "site.conf lists collection '$cid' with no folder" }
  $cc = Read-Conf (Join-Path $cdir 'collection.conf')
  if ($cc.Meta.ID -ne $cid) { throw "collections\$cid\collection.conf: @@ID does not match the folder name" }

  $groups = @()
  if ($cc.Meta.ContainsKey('GROUPS')) {
    $groups = @($cc.Meta.GROUPS -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ })
  }

  $ids = @()
  foreach ($f in (Get-ChildItem -LiteralPath (Join-Path $cdir 'pages') -Filter '*.html' | Sort-Object Name)) {
    $raw   = [System.IO.File]::ReadAllText($f.FullName)
    $split = $raw -split '(?m)^@@END\s*$', 2
    if ($split.Count -ne 2) { throw "$($f.Name): no @@END line closing the header block" }

    $meta = @{}
    foreach ($line in ($split[0] -split "`r?`n")) {
      if ($line -match '^@@([A-Z]+):\s*(.*)$') { $meta[$Matches[1]] = $Matches[2].Trim() }
    }
    foreach ($req in 'ID','TITLE','SECTION','SUMMARY','STATUS') {
      if (-not $meta.ContainsKey($req)) { throw "$($f.Name): missing @@$req" }
    }
    if ($meta.ID -ne [IO.Path]::GetFileNameWithoutExtension($f.Name)) {
      throw "$($f.Name): @@ID '$($meta.ID)' does not match the filename"
    }
    # Ids address pages from anywhere on the site, so a duplicate is ambiguous,
    # not merely untidy. Refuse rather than silently let one shadow the other.
    if ($pages.Contains($meta.ID)) {
      throw "duplicate page id '$($meta.ID)' in collection '$cid' - ids must be unique site-wide"
    }
    if ($groups.Count -and $groups -notcontains $meta.SECTION) {
      throw "$($f.Name): @@SECTION '$($meta.SECTION)' is not in collection '$cid' @@GROUPS"
    }

    $body = $split[1].Trim()
    $secs = @()
    foreach ($m in [regex]::Matches($body, '(?s)<section\b([^>]*)>(.*?)</section>')) {
      $inner = $m.Groups[2].Value
      if ($inner -match '<section\b') { throw "$($f.Name): nested <section> is not supported" }
      $mode = 'slide'
      if ($m.Groups[1].Value -match 'data-deck\s*=\s*"([^"]+)"') { $mode = $Matches[1] }
      $secs += [pscustomobject]@{ Mode = $mode; Html = $inner.Trim() }
    }
    if ($secs.Count -eq 0) { throw "$($f.Name): no <section> blocks found" }

    $pages[$meta.ID] = [pscustomobject]@{
      Id         = $meta.ID
      Title      = $meta.TITLE
      Section    = $meta.SECTION
      Summary    = $meta.SUMMARY
      Status     = $meta.STATUS
      Collection = $cid
      Sections   = $secs
      Body       = $body
      Decks      = [System.Collections.ArrayList]@()
    }
    $ids += $meta.ID
  }

  $collections[$cid] = [pscustomobject]@{
    Id      = $cid
    Title   = $cc.Meta.TITLE
    Summary = $cc.Meta.SUMMARY
    Groups  = $groups
    PageIds = $ids
  }
  Write-Host ("collection {0,-10} {1} pages" -f $cid, $ids.Count)
}

# ------------------------------------------------------------------ decks ----
$decks = [ordered]@{}
foreach ($f in (Get-ChildItem -LiteralPath $deckDir -Filter '*.deck' | Sort-Object Name)) {
  $dc = Read-Conf $f.FullName
  foreach ($req in 'DECK','TITLE') {
    if (-not $dc.Meta.ContainsKey($req)) { throw "$($f.Name): missing @@$req" }
  }
  $items = @()
  foreach ($line in ($dc.Body -split "`r?`n")) {
    $t = $line.Trim()
    if ($t -eq '' -or $t.StartsWith('#')) { continue }
    if ($t.StartsWith('>')) {
      $items += [pscustomobject]@{ Kind = 'divider'; Value = $t.Substring(1).Trim() }
    } else {
      if (-not $pages.Contains($t)) { throw "$($f.Name): lists unknown page '$t'" }
      $items += [pscustomobject]@{ Kind = 'page'; Value = $t }
      [void]$pages[$t].Decks.Add($dc.Meta.DECK)
    }
  }
  $decks[$dc.Meta.DECK] = [pscustomobject]@{
    Name     = $dc.Meta.DECK
    Title    = $dc.Meta.TITLE
    Subtitle = if ($dc.Meta.ContainsKey('SUBTITLE')) { $dc.Meta.SUBTITLE } else { '' }
    Footer   = if ($dc.Meta.ContainsKey('FOOTER'))   { $dc.Meta.FOOTER }   else { $site.FOOTER }
    Items    = $items
    PageIds  = @($items | Where-Object Kind -eq 'page' | ForEach-Object Value)
  }
}
Write-Host ("decks: {0}" -f $decks.Count)

# -------------------------------------------------------- link resolution ----
# The only place a [[link]] becomes an href. Five containers, because the same
# authored line has to work in all of them:
#
#   site-page    docs\<coll>\<id>.html  -> sibling, or ..\<other-coll>\<id>.html
#   site-deck    docs\deck-<name>.html  -> #p-<id> if in this deck, else <coll>\<id>.html
#   bundle-coll  one file per collection -> #p-<id> inside it, else absolute URL
#   bundle-deck  one file per deck       -> #p-<id> inside it, else absolute URL
#
# $ctx carries what the container needs: .Deck (id set) and .Coll (collection id).
function Resolve-Links([string]$html, $ctx, [string]$mode) {
  [regex]::Replace($html, '\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]', {
    param($m)
    $id    = $m.Groups[1].Value.Trim()
    $label = if ($m.Groups[2].Success) { $m.Groups[2].Value.Trim() } else { $null }

    if (-not $script:allPages.Contains($id)) {
      $text = if ($label) { $label } else { $id }
      return '<span class="xref-missing" title="No page with id ''' + $id + '''">' +
             (ConvertTo-HtmlText $text) + '</span>'
    }
    $tp   = $script:allPages[$id]
    $text = ConvertTo-HtmlText $(if ($label) { $label } else { $tp.Title })

    switch ($mode) {
      'site-page' {
        $href = if ($tp.Collection -eq $ctx.Coll) { "$id.html" } else { "../$($tp.Collection)/$id.html" }
        return '<a class="xref-page" href="' + $href + '">' + $text + '</a>'
      }
      'site-deck' {
        if ($ctx.Deck.Contains($id)) { return '<a class="xref-in" href="#p-' + $id + '">' + $text + '</a>' }
        return '<a class="xref-out" href="' + $tp.Collection + '/' + $id + '.html" target="_blank" rel="noopener">' + $text + '</a>'
      }
      'bundle-coll' {
        if ($tp.Collection -eq $ctx.Coll) { return '<a class="xref-page" href="#p-' + $id + '">' + $text + '</a>' }
        return '<a class="xref-out" href="' + $script:siteUrl + '/' + $tp.Collection + '/' + $id + '.html" target="_blank" rel="noopener">' + $text + '</a>'
      }
      'bundle-deck' {
        if ($ctx.Deck.Contains($id)) { return '<a class="xref-in" href="#p-' + $id + '">' + $text + '</a>' }
        return '<a class="xref-out" href="' + $script:siteUrl + '/' + $tp.Collection + '/' + $id + '.html" target="_blank" rel="noopener">' + $text + '</a>'
      }
      default { throw "Resolve-Links: unknown mode '$mode'" }
    }
  })
}
$script:allPages = $pages
$script:siteUrl  = $SiteUrl

# ----------------------------------------------------------------- chrome ----
$logoLight = '<img class="logo light-only" alt="Murray State University School of Engineering" src="' +
             (Get-DataUri 'assets\soe-logo-4c.png') + '">'
$logoDark  = '<img class="logo dark-only" alt="" aria-hidden="true" src="' +
             (Get-DataUri 'assets\soe-logo-4c-reversed.png') + '">'
$lockup    = "$logoLight`n$logoDark"

$fontLink = @'
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=JetBrains+Mono:wght@400;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
'@

# $up is '' at the site root and '../' one level down, so the same builder
# serves the landing page and a page inside a collection.
function New-Document([string]$title, [string]$css, [string]$bodyClass, [string]$content, [string]$script, [string]$up) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<!DOCTYPE html>')
  [void]$sb.AppendLine('<html lang="en">')
  [void]$sb.AppendLine('<head>')
  [void]$sb.AppendLine('<meta charset="utf-8">')
  [void]$sb.AppendLine('<meta name="viewport" content="width=device-width, initial-scale=1">')
  [void]$sb.AppendLine('<title>' + (ConvertTo-HtmlText $title) + '</title>')
  [void]$sb.AppendLine($fontLink.Trim())
  [void]$sb.AppendLine('<link rel="stylesheet" href="' + $up + 'theme/msu-theme.css">')
  [void]$sb.AppendLine('<link rel="stylesheet" href="' + $up + 'theme/' + $css + '">')
  [void]$sb.AppendLine('</head>')
  [void]$sb.AppendLine('<body class="' + $bodyClass + '">')
  [void]$sb.AppendLine($content.TrimEnd())
  if ($script) { [void]$sb.AppendLine($script.TrimEnd()) }
  [void]$sb.AppendLine('</body>')
  [void]$sb.AppendLine('</html>')
  $sb.ToString()
}

function New-Topbar([string]$up, [string]$currentColl) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<div class="topbar"><div class="topbar-inner">')
  [void]$sb.AppendLine('  <a class="home" href="' + $up + 'index.html">' + (ConvertTo-HtmlText $site.TITLE) + '</a>')
  [void]$sb.AppendLine('  <nav>')
  foreach ($c in $collections.Values) {
    $cur = if ($c.Id -eq $currentColl) { ' aria-current="page"' } else { '' }
    [void]$sb.AppendLine('    <a' + $cur + ' href="' + $up + $c.Id + '/index.html">' + (ConvertTo-HtmlText $c.Title) + '</a>')
  }
  [void]$sb.AppendLine('    <a href="' + $up + 'presentations.html">Presentations</a>')
  [void]$sb.AppendLine('  </nav>')
  [void]$sb.AppendLine('</div></div>')
  $sb.ToString()
}

function New-Colophon { '<div class="colophon">' + (ConvertTo-HtmlText $site.FOOTER) + '</div>' }

function New-PageCards($pageList, [string]$up, [string]$fromColl) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('    <div class="hub-grid">')
  foreach ($p in $pageList) {
    $cls  = if ($p.Status -eq 'ready') { 'card' } else { 'card pending' }
    $href = if ($p.Collection -eq $fromColl) { "$($p.Id).html" } else { "$up$($p.Collection)/$($p.Id).html" }
    [void]$sb.AppendLine('      <a class="' + $cls + '" href="' + $href + '">')
    [void]$sb.AppendLine('        <span class="t">' + (ConvertTo-HtmlText $p.Title) + '</span>')
    [void]$sb.AppendLine('        <span class="s">' + (ConvertTo-HtmlText $p.Summary) + '</span>')
    [void]$sb.AppendLine('      </a>')
  }
  [void]$sb.AppendLine('    </div>')
  $sb.ToString()
}

# ------------------------------------------------------------ landing page ---
Write-Host 'landing'
$hub = New-Object System.Text.StringBuilder
[void]$hub.AppendLine((New-Topbar '' ''))
[void]$hub.AppendLine('<div class="sheet wide">')
[void]$hub.AppendLine('  <header class="masthead">')
[void]$hub.AppendLine('    <div class="stamp">' + $lockup + '</div>')
[void]$hub.AppendLine('    <div class="eyebrow">' + (ConvertTo-HtmlText $site.TAGLINE) + '</div>')
[void]$hub.AppendLine('    <h1>' + (ConvertTo-HtmlText $site.TITLE) + '</h1>')
[void]$hub.AppendLine('    <p class="lede">' + (ConvertTo-HtmlText $site.SUMMARY) + '</p>')
[void]$hub.AppendLine('  </header>')

[void]$hub.AppendLine('  <section>')
[void]$hub.AppendLine('    <h2>Sections</h2>')
[void]$hub.AppendLine('    <div class="hub-grid">')
foreach ($c in $collections.Values) {
  $ready = @($c.PageIds | Where-Object { $pages[$_].Status -eq 'ready' }).Count
  [void]$hub.AppendLine('      <a class="card big" href="' + $c.Id + '/index.html">')
  [void]$hub.AppendLine('        <span class="t">' + (ConvertTo-HtmlText $c.Title) + '</span>')
  [void]$hub.AppendLine('        <span class="s">' + (ConvertTo-HtmlText $c.Summary) + '</span>')
  [void]$hub.AppendLine('        <span class="n">' + $ready + ' pages</span>')
  [void]$hub.AppendLine('      </a>')
}
[void]$hub.AppendLine('    </div>')
[void]$hub.AppendLine('  </section>')

[void]$hub.AppendLine('  <section>')
[void]$hub.AppendLine('    <h2>Presentations</h2>')
[void]$hub.AppendLine('    <p class="aside">Each one is a curated selection of the pages above. A link to a page a presentation does not include still works &mdash; it opens that page in a new tab.</p>')
[void]$hub.AppendLine('    <div class="decklist">')
foreach ($d in $decks.Values) {
  [void]$hub.AppendLine('      <a class="deckrow" href="deck-' + $d.Name + '.html">')
  [void]$hub.AppendLine('        <span class="t">' + (ConvertTo-HtmlText $d.Title) + '</span>')
  [void]$hub.AppendLine('        <span class="n">' + $d.PageIds.Count + ' pages</span>')
  [void]$hub.AppendLine('      </a>')
}
[void]$hub.AppendLine('    </div>')
[void]$hub.AppendLine('  </section>')
[void]$hub.AppendLine((New-Colophon))
[void]$hub.AppendLine('</div>')
Write-Out (Join-Path $docsDir 'index.html') `
          (New-Document $site.TITLE 'wiki.css' 'skin-document' $hub.ToString() '' '')

# GitHub Pages runs Jekyll unless told not to; nothing here needs it, and
# Jekyll silently drops files and folders whose names begin with an underscore.
Write-Out (Join-Path $docsDir '.nojekyll') ''

# ---------------------------------------------------- presentations index ----
$pi = New-Object System.Text.StringBuilder
[void]$pi.AppendLine((New-Topbar '' ''))
[void]$pi.AppendLine('<div class="sheet wide">')
[void]$pi.AppendLine('  <header class="masthead">')
[void]$pi.AppendLine('    <div class="eyebrow">' + (ConvertTo-HtmlText $site.TITLE) + '</div>')
[void]$pi.AppendLine('    <h1>Presentations</h1>')
[void]$pi.AppendLine('    <p class="lede">Curated from the section pages. Arrow keys advance a slide; press O for an overview of the whole deck.</p>')
[void]$pi.AppendLine('  </header>')
foreach ($d in $decks.Values) {
  [void]$pi.AppendLine('  <section>')
  [void]$pi.AppendLine('    <h2><a href="deck-' + $d.Name + '.html">' + (ConvertTo-HtmlText $d.Title) + '</a></h2>')
  if ($d.Subtitle) { [void]$pi.AppendLine('    <p class="lede">' + (ConvertTo-HtmlText $d.Subtitle) + '</p>') }
  [void]$pi.AppendLine((New-PageCards @($d.PageIds | ForEach-Object { $pages[$_] }) '' ''))
  [void]$pi.AppendLine('  </section>')
}
[void]$pi.AppendLine((New-Colophon))
[void]$pi.AppendLine('</div>')
Write-Out (Join-Path $docsDir 'presentations.html') `
          (New-Document 'Presentations' 'wiki.css' 'skin-document' $pi.ToString() '' '')

# ---------------------------------------------- collection index + pages -----
foreach ($c in $collections.Values) {
  Write-Host ("collection: {0}" -f $c.Id)
  $cd = Join-Path $docsDir $c.Id

  $ci = New-Object System.Text.StringBuilder
  [void]$ci.AppendLine((New-Topbar '../' $c.Id))
  [void]$ci.AppendLine('<div class="sheet wide">')
  [void]$ci.AppendLine('  <header class="masthead">')
  [void]$ci.AppendLine('    <div class="stamp">' + $lockup + '</div>')
  [void]$ci.AppendLine('    <div class="eyebrow">' + (ConvertTo-HtmlText $site.TAGLINE) + '</div>')
  [void]$ci.AppendLine('    <h1>' + (ConvertTo-HtmlText $c.Title) + '</h1>')
  [void]$ci.AppendLine('    <p class="lede">' + (ConvertTo-HtmlText $c.Summary) + '</p>')
  [void]$ci.AppendLine('  </header>')

  $groupNames = if ($c.Groups.Count) { $c.Groups }
                else { @($c.PageIds | ForEach-Object { $pages[$_].Section } | Select-Object -Unique) }
  foreach ($g in $groupNames) {
    $inGroup = @($c.PageIds | ForEach-Object { $pages[$_] } | Where-Object { $_.Section -eq $g } | Sort-Object Title)
    if (-not $inGroup.Count) { continue }
    [void]$ci.AppendLine('  <section>')
    [void]$ci.AppendLine('    <h2>' + (ConvertTo-HtmlText $g) + '</h2>')
    [void]$ci.AppendLine((New-PageCards $inGroup '../' $c.Id))
    [void]$ci.AppendLine('  </section>')
  }
  [void]$ci.AppendLine((New-Colophon))
  [void]$ci.AppendLine('</div>')
  Write-Out (Join-Path $cd 'index.html') `
            (New-Document ("$($c.Title) - $($site.TITLE)") 'wiki.css' 'skin-document' $ci.ToString() '' '../')

  foreach ($pageId in $c.PageIds) {
    $p  = $pages[$pageId]
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine((New-Topbar '../' $c.Id))
    [void]$sb.AppendLine('<div class="sheet">')
    [void]$sb.AppendLine('  <header class="masthead">')
    [void]$sb.AppendLine('    <div class="stamp">' + $lockup + '</div>')
    [void]$sb.AppendLine('    <div class="eyebrow"><a href="index.html">' + (ConvertTo-HtmlText $c.Title) +
                         '</a> &middot; ' + (ConvertTo-HtmlText $p.Section) +
                         $(if ($p.Status -ne 'ready') { ' &middot; ' + (ConvertTo-HtmlText $p.Status) } else { '' }) + '</div>')
    [void]$sb.AppendLine('    <h1>' + (ConvertTo-HtmlText $p.Title) + '</h1>')
    [void]$sb.AppendLine('    <p class="lede">' + (ConvertTo-HtmlText $p.Summary) + '</p>')
    [void]$sb.AppendLine('  </header>')
    [void]$sb.AppendLine((Resolve-Links $p.Body ([pscustomobject]@{ Coll = $c.Id }) 'site-page'))

    [void]$sb.AppendLine('  <div class="usedin">')
    if ($p.Decks.Count -gt 0) {
      [void]$sb.AppendLine('    <div class="k">Appears in</div>')
      [void]$sb.AppendLine('    <div class="chips">')
      foreach ($dn in ($p.Decks | Select-Object -Unique)) {
        [void]$sb.AppendLine('      <a class="chip" href="../deck-' + $dn + '.html#p-' + $p.Id + '">' +
                             (ConvertTo-HtmlText $decks[$dn].Title) + '</a>')
      }
      [void]$sb.AppendLine('    </div>')
    } else {
      [void]$sb.AppendLine('    <div class="k">Not in any presentation yet</div>')
    }
    [void]$sb.AppendLine('  </div>')
    [void]$sb.AppendLine((New-Colophon))
    [void]$sb.AppendLine('</div>')
    Write-Out (Join-Path $cd "$($p.Id).html") `
              (New-Document ("$($p.Title) - $($site.TITLE)") 'wiki.css' 'skin-document' $sb.ToString() '' '../')
  }
}

# ------------------------------------------------------------------ decks ----
$deckScript = @'
<script>
(function () {
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var bar    = document.querySelector('.progress > i');
  var ov     = document.querySelector('.overview');
  if (!slides.length) return;

  function current() {
    var best = 0, bestD = Infinity;
    for (var i = 0; i < slides.length; i++) {
      var d = Math.abs(slides[i].getBoundingClientRect().top);
      if (d < bestD) { bestD = d; best = i; }
    }
    return best;
  }
  function go(i) {
    i = Math.max(0, Math.min(slides.length - 1, i));
    slides[i].scrollIntoView({ block: 'start' });
  }
  function paint() {
    if (bar) bar.style.width = ((current() + 1) / slides.length * 100) + '%';
  }
  addEventListener('scroll', paint, { passive: true });
  paint();

  function toggle(force) {
    if (!ov) return;
    var open = (force === undefined) ? !ov.hasAttribute('data-open') : force;
    if (open) { ov.setAttribute('data-open', ''); } else { ov.removeAttribute('data-open'); }
  }

  addEventListener('keydown', function (e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var open = ov && ov.hasAttribute('data-open');
    switch (e.key) {
      case 'ArrowRight': case 'ArrowDown': case 'PageDown': case ' ':
        if (open) return; e.preventDefault(); go(current() + 1); break;
      case 'ArrowLeft': case 'ArrowUp': case 'PageUp':
        if (open) return; e.preventDefault(); go(current() - 1); break;
      case 'Home': e.preventDefault(); go(0); break;
      case 'End':  e.preventDefault(); go(slides.length - 1); break;
      case 'o': case 'O': e.preventDefault(); toggle(); break;
      case 'Escape': if (open) { e.preventDefault(); toggle(false); } break;
    }
  });

  var ob = document.querySelector('[data-act="overview"]');
  if (ob) ob.addEventListener('click', function () { toggle(); });
  var pb = document.querySelector('[data-act="print"]');
  if (pb) pb.addEventListener('click', function () { print(); });

  Array.prototype.forEach.call(document.querySelectorAll('.ov-item'), function (b) {
    b.addEventListener('click', function () {
      toggle(false);
      go(parseInt(b.getAttribute('data-i'), 10));
    });
  });
})();
</script>
'@

# One deck body, built once per link mode. Everything but link resolution and
# the home button is identical, so the slide markup is never duplicated.
function New-DeckBody($d, [string]$mode) {
  $set = [System.Collections.Generic.HashSet[string]]::new()
  foreach ($id in $d.PageIds) { [void]$set.Add($id) }
  $ctx = [pscustomobject]@{ Deck = $set; Coll = '' }

  $slides  = New-Object System.Text.StringBuilder
  $ovItems = New-Object System.Text.StringBuilder
  $n = 0

  $n++
  [void]$slides.AppendLine('<section class="slide title" id="s1">')
  [void]$slides.AppendLine('  <div class="slide-top"><span class="src">' + (ConvertTo-HtmlText $d.Footer) + '</span></div>')
  [void]$slides.AppendLine('  <div class="slide-body">')
  [void]$slides.AppendLine('    <div class="stamp">' + $lockup + '</div>')
  [void]$slides.AppendLine('    <h1>' + (ConvertTo-HtmlText $d.Title) + '</h1>')
  if ($d.Subtitle) { [void]$slides.AppendLine('    <p class="lede">' + (ConvertTo-HtmlText $d.Subtitle) + '</p>') }
  [void]$slides.AppendLine('  </div>')
  [void]$slides.AppendLine('  <div class="slide-bottom"><span>Arrow keys to advance &middot; O for an overview</span><span class="num">1</span></div>')
  [void]$slides.AppendLine('</section>')
  [void]$ovItems.AppendLine('<button class="ov-item" data-i="0"><span class="n">1</span><span class="t">' +
                            (ConvertTo-HtmlText $d.Title) + '</span><span class="p">Title</span></button>')

  foreach ($item in $d.Items) {
    if ($item.Kind -eq 'divider') {
      $n++
      [void]$slides.AppendLine('<section class="slide divider" id="s' + $n + '">')
      [void]$slides.AppendLine('  <div class="slide-top"><span class="src">' + (ConvertTo-HtmlText $d.Title) + '</span></div>')
      [void]$slides.AppendLine('  <div class="slide-body"><h1>' + (ConvertTo-HtmlText $item.Value) + '</h1></div>')
      [void]$slides.AppendLine('  <div class="slide-bottom"><span></span><span class="num">' + $n + '</span></div>')
      [void]$slides.AppendLine('</section>')
      [void]$ovItems.AppendLine('<button class="ov-item" data-i="' + ($n-1) + '"><span class="n">' + $n +
                                '</span><span class="t">' + (ConvertTo-HtmlText $item.Value) +
                                '</span><span class="p">Divider</span></button>')
      continue
    }

    $p = $pages[$item.Value]
    $srcHref = if ($mode -eq 'bundle-deck') { "$script:siteUrl/$($p.Collection)/$($p.Id).html" }
               else { "$($p.Collection)/$($p.Id).html" }
    $first = $true
    foreach ($s in $p.Sections) {
      if ($s.Mode -eq 'wiki-only') { continue }
      $html = Resolve-Links $s.Html $ctx $mode

      if ($s.Mode -eq 'with-previous') { [void]$slides.AppendLine('    ' + $html); continue }

      if (-not $first) {
        [void]$slides.AppendLine('  </div>')
        [void]$slides.AppendLine('  <div class="slide-bottom"><span>' + (ConvertTo-HtmlText $d.Footer) +
                                 '</span><span class="num">' + $n + '</span></div>')
        [void]$slides.AppendLine('</section>')
      }
      $n++
      $anchorId = if ($first) { ' id="p-' + $p.Id + '"' } else { ' id="s' + $n + '"' }
      [void]$slides.AppendLine('<section class="slide"' + $anchorId + '>')
      [void]$slides.AppendLine('  <div class="slide-top"><a class="src" href="' + $srcHref +
                               '" target="_blank" rel="noopener">' + (ConvertTo-HtmlText $p.Title) +
                               '</a><span class="sec">' + (ConvertTo-HtmlText $p.Section) + '</span></div>')
      [void]$slides.AppendLine('  <div class="slide-body">')
      [void]$slides.AppendLine('    ' + $html)

      $lbl = if ($s.Html -match '(?s)<h2[^>]*>(.*?)</h2>') { ($Matches[1] -replace '<[^>]+>','').Trim() } else { $p.Title }
      [void]$ovItems.AppendLine('<button class="ov-item" data-i="' + ($n-1) + '"><span class="n">' + $n +
                                '</span><span class="t">' + (ConvertTo-HtmlText $lbl) +
                                '</span><span class="p">' + (ConvertTo-HtmlText $p.Title) + '</span></button>')
      $first = $false
    }
    if (-not $first) {
      [void]$slides.AppendLine('  </div>')
      [void]$slides.AppendLine('  <div class="slide-bottom"><span>' + (ConvertTo-HtmlText $d.Footer) +
                               '</span><span class="num">' + $n + '</span></div>')
      [void]$slides.AppendLine('</section>')
    }
  }

  $homeHref = if ($mode -eq 'bundle-deck') { "$script:siteUrl/index.html" } else { 'index.html' }

  $body = New-Object System.Text.StringBuilder
  [void]$body.AppendLine('<div class="progress"><i></i></div>')
  [void]$body.AppendLine($slides.ToString().TrimEnd())
  [void]$body.AppendLine('<div class="deck-ctl">')
  [void]$body.AppendLine('  <button data-act="overview" type="button">Overview</button>')
  [void]$body.AppendLine('  <button data-act="print" type="button">Print</button>')
  [void]$body.AppendLine('  <a href="' + $homeHref + '"><button type="button">Site</button></a>')
  [void]$body.AppendLine('</div>')
  [void]$body.AppendLine('<div class="overview" aria-label="Slide overview">')
  [void]$body.AppendLine('  <h2>' + (ConvertTo-HtmlText $d.Title) + ' &mdash; ' + $n + ' slides</h2>')
  [void]$body.AppendLine('  <div class="ov-grid">')
  [void]$body.AppendLine($ovItems.ToString().TrimEnd())
  [void]$body.AppendLine('  </div>')
  [void]$body.AppendLine('</div>')

  [pscustomobject]@{ Html = $body.ToString(); Slides = $n }
}

Write-Host 'decks'
foreach ($d in $decks.Values) {
  $r = New-DeckBody $d 'site-deck'
  Write-Out (Join-Path $docsDir ('deck-' + $d.Name + '.html')) `
            (New-Document ("$($d.Title) - $($site.TITLE)") 'deck.css' 'deck skin-document' $r.Html $deckScript '')
  Write-Host ("    {0,-24} {1} slides" -f $d.Name, $r.Slides)
}

# ------------------------------------------------------------------ theme ----
Write-Host 'theme'
foreach ($css in (Get-ChildItem -LiteralPath $themeDir -Filter '*.css')) {
  Write-Out (Join-Path $docsDir ('theme\' + $css.Name)) ([System.IO.File]::ReadAllText($css.FullName))
}

# ----------------------------------------------------------------- bundle ----
# Self-contained single files - CSS inlined, logo already a data URI, no
# siblings. Canvas rewrites uploaded-file URLs, so a relative href between two
# uploaded files does not survive; one file has none to break. The collection
# bundle needs no JavaScript at all, and a deck bundle keeps scroll-snap paging
# if a sanitiser strips its script.
if ($Bundle) {
  Write-Host 'bundle'
  $bundleDir = Join-Path $root 'bundle'
  $themeCss  = [System.IO.File]::ReadAllText((Join-Path $themeDir 'msu-theme.css'))
  $wikiCss   = [System.IO.File]::ReadAllText((Join-Path $themeDir 'wiki.css'))
  $deckCss   = [System.IO.File]::ReadAllText((Join-Path $themeDir 'deck.css'))
  $bundleExtra = @'

/* ---- single-file bundle only ------------------------------------------- */
.sheet.bundled { border-top: 3px solid var(--accent); padding-top: 2.5rem; }
.sheet.bundled h1 { font-size: clamp(1.9rem, 5.5vw, 2.5rem); }
@media print { .sheet.bundled { break-before: page; } }
'@

  function New-BundleDocument([string]$title, [string]$css, [string]$bodyClass, [string]$content, [string]$script) {
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine('<!DOCTYPE html>')
    [void]$sb.AppendLine('<html lang="en">')
    [void]$sb.AppendLine('<head>')
    [void]$sb.AppendLine('<meta charset="utf-8">')
    [void]$sb.AppendLine('<meta name="viewport" content="width=device-width, initial-scale=1">')
    [void]$sb.AppendLine('<title>' + (ConvertTo-HtmlText $title) + '</title>')
    [void]$sb.AppendLine($fontLink.Trim())
    [void]$sb.AppendLine('<style>')
    [void]$sb.AppendLine($css.TrimEnd())
    [void]$sb.AppendLine('</style>')
    [void]$sb.AppendLine('</head>')
    [void]$sb.AppendLine('<body class="' + $bodyClass + '">')
    [void]$sb.AppendLine($content.TrimEnd())
    if ($script) { [void]$sb.AppendLine($script.TrimEnd()) }
    [void]$sb.AppendLine('</body>')
    [void]$sb.AppendLine('</html>')
    $sb.ToString()
  }

  foreach ($c in $collections.Values) {
    $ctx = [pscustomobject]@{ Coll = $c.Id }
    $bw  = New-Object System.Text.StringBuilder
    [void]$bw.AppendLine('<a id="top"></a>')
    [void]$bw.AppendLine('<div class="sheet wide">')
    [void]$bw.AppendLine('  <header class="masthead">')
    [void]$bw.AppendLine('    <div class="stamp">' + $lockup + '</div>')
    [void]$bw.AppendLine('    <div class="eyebrow">' + (ConvertTo-HtmlText $site.TAGLINE) + '</div>')
    [void]$bw.AppendLine('    <h1>' + (ConvertTo-HtmlText $c.Title) + '</h1>')
    [void]$bw.AppendLine('    <p class="lede">' + (ConvertTo-HtmlText $c.Summary) + '</p>')
    [void]$bw.AppendLine('  </header>')
    $groupNames = if ($c.Groups.Count) { $c.Groups }
                  else { @($c.PageIds | ForEach-Object { $pages[$_].Section } | Select-Object -Unique) }
    foreach ($g in $groupNames) {
      $inGroup = @($c.PageIds | ForEach-Object { $pages[$_] } | Where-Object { $_.Section -eq $g } | Sort-Object Title)
      if (-not $inGroup.Count) { continue }
      [void]$bw.AppendLine('  <section>')
      [void]$bw.AppendLine('    <h2>' + (ConvertTo-HtmlText $g) + '</h2>')
      [void]$bw.AppendLine('    <div class="hub-grid">')
      foreach ($p in $inGroup) {
        $cls = if ($p.Status -eq 'ready') { 'card' } else { 'card pending' }
        [void]$bw.AppendLine('      <a class="' + $cls + '" href="#p-' + $p.Id + '">')
        [void]$bw.AppendLine('        <span class="t">' + (ConvertTo-HtmlText $p.Title) + '</span>')
        [void]$bw.AppendLine('        <span class="s">' + (ConvertTo-HtmlText $p.Summary) + '</span>')
        [void]$bw.AppendLine('      </a>')
      }
      [void]$bw.AppendLine('    </div>')
      [void]$bw.AppendLine('  </section>')
    }
    [void]$bw.AppendLine('</div>')

    foreach ($g in $groupNames) {
      foreach ($p in @($c.PageIds | ForEach-Object { $pages[$_] } | Where-Object { $_.Section -eq $g } | Sort-Object Title)) {
        [void]$bw.AppendLine('<article class="sheet bundled" id="p-' + $p.Id + '">')
        [void]$bw.AppendLine('  <header class="masthead">')
        [void]$bw.AppendLine('    <div class="eyebrow">' + (ConvertTo-HtmlText $p.Section) +
                             $(if ($p.Status -ne 'ready') { ' &middot; ' + (ConvertTo-HtmlText $p.Status) } else { '' }) + '</div>')
        [void]$bw.AppendLine('    <h1>' + (ConvertTo-HtmlText $p.Title) + '</h1>')
        [void]$bw.AppendLine('    <p class="lede">' + (ConvertTo-HtmlText $p.Summary) + '</p>')
        [void]$bw.AppendLine('  </header>')
        [void]$bw.AppendLine((Resolve-Links $p.Body $ctx 'bundle-coll'))
        [void]$bw.AppendLine('  <div class="usedin"><a class="chip" href="#top">Back to contents</a></div>')
        [void]$bw.AppendLine('</article>')
      }
    }
    Write-Out (Join-Path $bundleDir ($c.Id + '.html')) `
              (New-BundleDocument ("$($c.Title) - $($site.TITLE)") ($themeCss + "`n" + $wikiCss + $bundleExtra) `
                                  'skin-document' $bw.ToString() '')
  }

  foreach ($d in $decks.Values) {
    $r = New-DeckBody $d 'bundle-deck'
    Write-Out (Join-Path $bundleDir ('deck-' + $d.Name + '.html')) `
              (New-BundleDocument $d.Title ($themeCss + "`n" + $deckCss) 'deck skin-document' $r.Html $deckScript)
  }
}

# ------------------------------------------------------------ link report ----
$dangling = @()
foreach ($p in $pages.Values) {
  foreach ($m in [regex]::Matches($p.Body, '\[\[([^\]\|]+)(?:\|[^\]]+)?\]\]')) {
    $id = $m.Groups[1].Value.Trim()
    if (-not $pages.Contains($id)) { $dangling += "$($p.Id) -> $id" }
  }
}
if ($dangling.Count) {
  Write-Host ''
  Write-Host ("links to pages that do not exist yet ({0}):" -f $dangling.Count)
  $dangling | Sort-Object -Unique | ForEach-Object { Write-Host "  $_" }
}
$orphans = @($pages.Values | Where-Object { $_.Decks.Count -eq 0 } | ForEach-Object Id)
if ($orphans.Count) {
  Write-Host ''
  Write-Host ("pages in no presentation ({0}): {1}" -f $orphans.Count, ($orphans -join ', '))
}
Write-Host ''
Write-Host ("done -> {0}" -f $docsDir)
