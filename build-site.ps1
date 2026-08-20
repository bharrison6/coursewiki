<#
    build-site.ps1 - render the DET site: landing page, collections, decks.

    THE MODEL
      A PAGE is one topic, authored once, as an @@FIELD: header plus a stack of
      <section> blocks. It lives in collections\<coll>\pages\<id>.html.

      A COLLECTION is a section of the site. It gets its own folder, its own
      index, its own URL, and its own single-file bundle.

      A DECK is a manifest in decks\<name>.deck naming pages in order. Decks are
      SITE-level: a presentation may pull from any collection. Every <section>
      becomes one slide.

      A LINK is [[page-id]] or [[page-id|text]]. Ids are unique site-wide, and
      one authored link resolves to five destinations - see Resolve-Links.

    WHAT THE GENERATOR ADDS THAT THE SOURCE DOES NOT CARRY
      Each authored <section> is wrapped in <details class="xcard"> for the web
      render. That is done HERE, not in the sources, so that:
        - the deck renderer keeps splitting on <section> and needs no change,
        - the same source stays printable and slide-able,
        - disclosure works with JavaScript off, because <details> is native.

    OUTPUT
      docs\    the site. GitHub Pages serves it from main/docs with no CI.
      bundle\  self-contained single files, CSS and JS inlined, no siblings.

    Usage
      pwsh -File .\build-site.ps1
      pwsh -File .\build-site.ps1 -Bundle
      pwsh -File .\build-site.ps1 -Bundle -SiteUrl "https://example.org/det"
      pwsh -File .\build-site.ps1 -WhatIf
#>
[CmdletBinding()]
param(
  [switch] $Bundle,
  # Remove files in docs that this build did not produce (renamed or deleted
  # sources leave stale pages that Pages would keep serving).
  [switch] $Prune,
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

$script:written = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

function Write-Out([string]$path, [string]$text) {
  [void]$script:written.Add($path)
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
function ConvertTo-Plain([string]$html) {
  $t = $html -replace '(?s)<[^>]+>', ' '
  $t = $t -replace '&mdash;','-' -replace '&middot;','-' -replace '&nbsp;',' '
  $t = $t -replace '&ldquo;|&rdquo;','"' -replace '&rsquo;',"'" -replace '&amp;','&'
  ($t -replace '\s+', ' ').Trim()
}
function ConvertTo-Slug([string]$s) {
  $t = (ConvertTo-Plain $s).ToLower()
  $t = $t -replace '[^a-z0-9]+', '-'
  $t.Trim('-')
}
function ConvertTo-Json1([string]$s) {
  # Enough escaping for embedding a string in a JS literal.
  $s.Replace('\','\\').Replace('"','\"').Replace("`r",'').Replace("`n",' ')
}
function Format-Count([int]$n, [string]$noun) {
  if ($n -eq 1) { "$n $noun" } else { "$n ${noun}s" }
}

# How many slides a page contributes to a deck: one per section, minus the
# wiki-only ones, minus those merged onto the previous slide. Counted from the
# same rules the deck renderer uses, so a playlist's track length cannot drift
# from what the player actually shows.
function Get-PageSlideCount($p) {
  @($p.Sections | Where-Object { $_.Mode -ne 'wiki-only' -and $_.Mode -ne 'with-previous' }).Count
}
function Get-DeckSlideCount($d) {
  $n = 1  # the title slide
  foreach ($item in $d.Items) {
    if ($item.Kind -eq 'divider') { $n++ }
    else { $n += Get-PageSlideCount $script:allPages[$item.Value] }
  }
  $n
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
$pages       = [ordered]@{}
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
    if ($pages.Contains($meta.ID)) {
      throw "duplicate page id '$($meta.ID)' in collection '$cid' - ids must be unique site-wide"
    }
    if ($groups.Count -and $groups -notcontains $meta.SECTION) {
      throw "$($f.Name): @@SECTION '$($meta.SECTION)' is not in collection '$cid' @@GROUPS"
    }

    $body = $split[1].Trim()
    $secs = @(); $i = 0
    foreach ($m in [regex]::Matches($body, '(?s)<section\b([^>]*)>(.*?)</section>')) {
      $i++
      $inner = $m.Groups[2].Value
      if ($inner -match '<section\b') { throw "$($f.Name): nested <section> is not supported" }
      $mode = 'slide'
      if ($m.Groups[1].Value -match 'data-deck\s*=\s*"([^"]+)"') { $mode = $Matches[1] }

      # The <h2> becomes the card's summary. It stays in the body too (hidden
      # by CSS) rather than being cut out, so nothing depends on a strip regex
      # being right, and the print stylesheet can still show it.
      $head = if ($inner -match '(?s)<h2[^>]*>(.*?)</h2>') { $Matches[1].Trim() } else { '' }
      $slug = if ($head) { ConvertTo-Slug $head } else { "section-$i" }
      if (-not $slug) { $slug = "section-$i" }

      $flag = ''
      if ($inner -match '<div class="stop"') { $flag = 'is-stop' }
      elseif ($inner -match '<div class="gate"') { $flag = 'is-gate' }

      $secs += [pscustomobject]@{
        Mode = $mode; Html = $inner.Trim(); Head = $head; Slug = $slug; Flag = $flag
      }
    }
    if ($secs.Count -eq 0) { throw "$($f.Name): no <section> blocks found" }

    # Slugs address cards within a page, so a collision breaks a deep link.
    $dupe = @($secs | Group-Object Slug | Where-Object Count -gt 1 | ForEach-Object Name)
    if ($dupe.Count) { throw "$($f.Name): duplicate section slug(s): $($dupe -join ', ')" }

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
    Id = $cid; Title = $cc.Meta.TITLE; Summary = $cc.Meta.SUMMARY
    Groups = $groups; PageIds = $ids
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
    Name = $dc.Meta.DECK; Title = $dc.Meta.TITLE
    Subtitle = if ($dc.Meta.ContainsKey('SUBTITLE')) { $dc.Meta.SUBTITLE } else { '' }
    Footer   = if ($dc.Meta.ContainsKey('FOOTER'))   { $dc.Meta.FOOTER }   else { $site.FOOTER }
    Items = $items
    PageIds = @($items | Where-Object Kind -eq 'page' | ForEach-Object Value)
  }
}
Write-Host ("decks: {0}" -f $decks.Count)

# -------------------------------------------------------- link resolution ----
# Five containers for one authored link:
#   site-page    docs\<coll>\<id>.html  -> sibling, or ..\<other>\<id>.html
#   site-deck    docs\deck-<n>.html     -> #p-<id> in deck, else <coll>\<id>.html
#   bundle-coll  one file per collection -> #p-<id> inside, else absolute URL
#   bundle-deck  one file per deck       -> #p-<id> inside, else absolute URL
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
# Two ways to carry the same mark. On the SITE it is a real file the browser
# caches once; inlining it as a data URI would add ~46 KB to every page for no
# gain. In a BUNDLE there are no sibling files, so it has to be inline.
# Either way both lockups ship and one is hidden by display - the mark is
# never recoloured.
$lockupData = '<img class="logo light-only" alt="Murray State University School of Engineering" src="' +
              (Get-DataUri 'assets\soe-logo-4c.png') + '">' + "`n" +
              '<img class="logo dark-only" alt="" aria-hidden="true" src="' +
              (Get-DataUri 'assets\soe-logo-4c-reversed.png') + '">'
$script:lockupDataBar = $lockupData.Replace('class="logo ', 'class="brandmark ')
function New-Lockup([string]$up, [string]$cls) {
  '<img class="' + $cls + ' light-only" alt="Murray State University School of Engineering" src="' +
  $up + 'assets/soe-logo-4c.png">' + "`n" +
  '<img class="' + $cls + ' dark-only" alt="" aria-hidden="true" src="' +
  $up + 'assets/soe-logo-4c-reversed.png">'
}

$fontLink = @'
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Archivo:wght@500;600;700&family=JetBrains+Mono:wght@400;700&family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap">
'@

# Applied before first paint so a stored dark choice does not flash light.
$themeBoot = @'
<script>
(function(){try{var m=JSON.parse(localStorage.getItem('det:theme'));
if(m==='light'||m==='dark'){document.documentElement.setAttribute('data-theme',m);}}catch(e){}})();
</script>
'@

$icoMenu  = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>'
$icoTheme = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"/><path d="M12 4v16" /><path d="M12 4a8 8 0 010 16" fill="currentColor" stroke="none"/></svg>'

function New-AppBar([string]$up, [string]$flavour) {
  # $flavour 'bundle' inlines the mark; anything else links the asset file.
  $mark = if ($flavour -eq 'bundle') {
            $script:lockupDataBar
          } else { New-Lockup $up 'brandmark' }
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<header class="appbar">')
  [void]$sb.AppendLine('  <button class="iconbtn nav-toggle" type="button" aria-expanded="false" aria-controls="sidebar" aria-label="Menu">' + $icoMenu + '</button>')
  [void]$sb.AppendLine('  <a class="brand" href="' + $up + 'index.html">')
  [void]$sb.AppendLine('    ' + $mark)
  [void]$sb.AppendLine('    <span class="sub">' + (ConvertTo-HtmlText $site.TITLE) + '</span>')
  [void]$sb.AppendLine('  </a>')
  [void]$sb.AppendLine('  <div class="search">')
  [void]$sb.AppendLine('    <input type="search" placeholder="Search topics" aria-label="Search topics" autocomplete="off" spellcheck="false">')
  [void]$sb.AppendLine('    <span class="hint">/</span>')
  [void]$sb.AppendLine('    <div class="results" role="listbox"></div>')
  [void]$sb.AppendLine('  </div>')
  [void]$sb.AppendLine('  <button class="iconbtn" type="button" data-act="theme" aria-label="Theme">' + $icoTheme + '</button>')
  [void]$sb.AppendLine('</header>')
  $sb.ToString()
}

# The side navigation. Nested <details> so it works with JavaScript off; JS
# only remembers which groups were left open.
# $mode 'site' -> real page links. 'bundle' -> in-file anchors for $onlyColl,
# absolute site links for everything else.
function New-Sidebar([string]$up, [string]$curPage, [string]$curColl, [string]$mode, [string]$onlyColl) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<aside class="sidebar" id="sidebar">')
  [void]$sb.AppendLine('  <h2>Topics</h2>')
  foreach ($c in $collections.Values) {
    $isCur = ($c.Id -eq $curColl)
    $open  = if ($isCur -or $collections.Count -le 2) { ' open' } else { '' }
    [void]$sb.AppendLine('  <details class="navgroup" data-nav="c-' + $c.Id + '"' + $open + '>')
    [void]$sb.AppendLine('    <summary><span class="chev"></span>' + (ConvertTo-HtmlText $c.Title) + '</summary>')

    $groupNames = if ($c.Groups.Count) { $c.Groups }
                  else { @($c.PageIds | ForEach-Object { $pages[$_].Section } | Select-Object -Unique) }
    foreach ($g in $groupNames) {
      $inGroup = @($c.PageIds | ForEach-Object { $pages[$_] } | Where-Object { $_.Section -eq $g } | Sort-Object Title)
      if (-not $inGroup.Count) { continue }
      $gslug = ConvertTo-Slug "$($c.Id)-$g"
      [void]$sb.AppendLine('    <details class="navgroup" data-nav="g-' + $gslug + '" open>')
      [void]$sb.AppendLine('      <summary><span class="chev"></span>' + (ConvertTo-HtmlText $g) + '</summary>')
      [void]$sb.AppendLine('      <ul class="navlist">')
      foreach ($p in $inGroup) {
        if ($mode -eq 'bundle') {
          $href = if ($c.Id -eq $onlyColl) { '#p-' + $p.Id } else { "$script:siteUrl/$($c.Id)/$($p.Id).html" }
        } else {
          $href = "$up$($c.Id)/$($p.Id).html"
        }
        $cur = if ($p.Id -eq $curPage) { ' aria-current="page"' } else { '' }
        $pend = if ($p.Status -ne 'ready') { '<span class="pending">pending</span>' } else { '' }
        [void]$sb.AppendLine('        <li><a' + $cur + ' href="' + $href + '">' +
                             (ConvertTo-HtmlText $p.Title) + $pend + '</a></li>')
      }
      [void]$sb.AppendLine('      </ul>')
      [void]$sb.AppendLine('    </details>')
    }
    [void]$sb.AppendLine('  </details>')
  }

  # Presentations are NOT topics, so they do not sit in the topic tree as a
  # peer of the collections. A presentation is a playlist - an ordered
  # selection OF the pages above, not a page of its own. It gets its own block
  # below the tree, and the link goes to the playlist (its track list), not
  # straight into the player.
  $plHref = if ($mode -eq 'bundle') { "$script:siteUrl/presentations.html" } else { "${up}presentations.html" }
  [void]$sb.AppendLine('  <div class="navsplit"></div>')
  [void]$sb.AppendLine('  <h2>Presentations</h2>')
  [void]$sb.AppendLine('  <p class="navnote">Playlists built from the topics above.</p>')
  [void]$sb.AppendLine('  <ul class="navlist playlists">')
  foreach ($d in $decks.Values) {
    [void]$sb.AppendLine('    <li><a href="' + $plHref + '#pl-' + $d.Name + '">' +
                         (ConvertTo-HtmlText $d.Title) +
                         '<span class="count">' + $d.PageIds.Count + '</span></a></li>')
  }
  [void]$sb.AppendLine('  </ul>')
  [void]$sb.AppendLine('</aside>')
  [void]$sb.AppendLine('<div class="backdrop"></div>')
  $sb.ToString()
}

function New-Document {
  param(
    [string]$title, [string]$bodyClass, [string]$content,
    [string]$up, [string]$pageKey, [string]$extraHead, [string]$scripts
  )
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<!DOCTYPE html>')
  [void]$sb.AppendLine('<html lang="en">')
  [void]$sb.AppendLine('<head>')
  [void]$sb.AppendLine('<meta charset="utf-8">')
  [void]$sb.AppendLine('<meta name="viewport" content="width=device-width, initial-scale=1">')
  [void]$sb.AppendLine('<title>' + (ConvertTo-HtmlText $title) + '</title>')
  [void]$sb.AppendLine($fontLink.Trim())
  [void]$sb.AppendLine($themeBoot.Trim())
  if ($extraHead) { [void]$sb.AppendLine($extraHead.TrimEnd()) }
  [void]$sb.AppendLine('</head>')
  [void]$sb.AppendLine('<body class="' + $bodyClass + '" data-page="' + $pageKey + '" data-base="' + $up + '">')
  [void]$sb.AppendLine($content.TrimEnd())
  if ($scripts) { [void]$sb.AppendLine($scripts.TrimEnd()) }
  [void]$sb.AppendLine('</body>')
  [void]$sb.AppendLine('</html>')
  $sb.ToString()
}

# Cache-busting stamp.
#
# GitHub Pages serves these assets with a cache lifetime, so a reader who has
# been here before keeps the OLD stylesheet, script and search index after a
# content update - even through a forced reload. That was observed directly:
# the deployed index had 42 rows while the browser was still running the
# previous 10-row copy. A stale search index is the dangerous one, because it
# looks like it is working while silently missing new content.
#
# One stamp over every asset. Occasionally re-fetching an unchanged file is a
# far cheaper mistake than serving a stale one.
function Get-BuildStamp([string[]]$parts) {
  $sha = [System.Security.Cryptography.SHA1]::Create()
  $bytes = [Text.Encoding]::UTF8.GetBytes(($parts -join "`n"))
  (( $sha.ComputeHash($bytes) | ForEach-Object { $_.ToString('x2') } ) -join '').Substring(0, 10)
}

$siteHead = { param($up) @"
<link rel="stylesheet" href="${up}theme/msu-theme.css?v=$script:stamp">
<link rel="stylesheet" href="${up}theme/app.css?v=$script:stamp">
"@ }
$siteScripts = { param($up) @"
<script src="${up}search-index.js?v=$script:stamp"></script>
<script src="${up}playlists.js?v=$script:stamp"></script>
<script src="${up}theme/app.js?v=$script:stamp"></script>
"@ }

# ---------------------------------------------------- section -> card --------
function New-Cards($p, $ctx, [string]$mode) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<div class="cardtools">')
  [void]$sb.AppendLine('  <button type="button" data-act="expand">Expand all</button>')
  [void]$sb.AppendLine('  <button type="button" data-act="collapse">Collapse all</button>')
  [void]$sb.AppendLine('</div>')
  [void]$sb.AppendLine('<div class="cards">')
  foreach ($s in $p.Sections) {
    $cls = 'xcard'
    if ($s.Flag) { $cls += ' ' + $s.Flag }
    $head = if ($s.Head) { $s.Head } else { ConvertTo-HtmlText $p.Title }
    [void]$sb.AppendLine('  <details class="' + $cls + '" id="' + $s.Slug + '" data-card="' + $s.Slug + '" open>')
    [void]$sb.AppendLine('    <summary>' + $head + '<span class="chev"></span></summary>')
    [void]$sb.AppendLine('    <div class="body">')
    [void]$sb.AppendLine('      ' + (Resolve-Links $s.Html $ctx $mode))
    [void]$sb.AppendLine('    </div>')
    [void]$sb.AppendLine('  </details>')
  }
  [void]$sb.AppendLine('</div>')
  $sb.ToString()
}

function New-Toc($p) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<aside class="toc">')
  [void]$sb.AppendLine('  <div class="k">On this page</div>')
  [void]$sb.AppendLine('  <ul>')
  foreach ($s in $p.Sections) {
    $lbl = if ($s.Head) { ConvertTo-HtmlText (ConvertTo-Plain $s.Head) } else { ConvertTo-HtmlText $p.Title }
    [void]$sb.AppendLine('    <li><a href="#' + $s.Slug + '">' + $lbl + '</a></li>')
  }
  [void]$sb.AppendLine('  </ul>')
  [void]$sb.AppendLine('</aside>')
  $sb.ToString()
}

function New-Tiles($pageList, [string]$up, [string]$fromColl, [string]$mode) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<div class="grid">')
  foreach ($p in $pageList) {
    $cls  = if ($p.Status -eq 'ready') { 'tile' } else { 'tile pending' }
    if ($mode -eq 'bundle') { $href = '#p-' + $p.Id }
    elseif ($p.Collection -eq $fromColl) { $href = "$($p.Id).html" }
    else { $href = "$up$($p.Collection)/$($p.Id).html" }
    [void]$sb.AppendLine('  <a class="' + $cls + '" href="' + $href + '">')
    [void]$sb.AppendLine('    <span class="t">' + (ConvertTo-HtmlText $p.Title) + '</span>')
    [void]$sb.AppendLine('    <span class="s">' + (ConvertTo-HtmlText $p.Summary) + '</span>')
    [void]$sb.AppendLine('  </a>')
  }
  [void]$sb.AppendLine('</div>')
  $sb.ToString()
}

# ------------------------------------------------------------ search index ---
# Emitted as a script that assigns a global, not JSON fetched at runtime: a
# browser blocks fetch() of a local file when the site is opened over file://,
# and a classic <script> is not subject to that.
# One row per SECTION, not per page.
#
# Per-page rows meant one long body string, which had to be capped to keep the
# index small - and the cap silently hid content. "galvanized" is in the PPE
# page's respiratory section, past the old 1400-character cut, so a search for
# a PROHIBITED material returned nothing at all. Sections are naturally short,
# so nothing is truncated now, and a hit deep-links to the card that holds it
# rather than dropping the reader at the top of a long page.
function New-SearchIndex([string]$mode) {
  $rows = @()
  foreach ($p in $pages.Values) {
    foreach ($s in $p.Sections) {
      $head = if ($s.Head) { ConvertTo-Plain $s.Head } else { $p.Title }
      $url  = if ($mode -eq 'bundle') { '#p-' + $p.Id } else { "$($p.Collection)/$($p.Id).html#$($s.Slug)" }
      $rows += '{"title":"' + (ConvertTo-Json1 $head) +
               '","page":"' + (ConvertTo-Json1 $p.Title) +
               '","summary":"' + (ConvertTo-Json1 $p.Summary) +
               '","collection":"' + (ConvertTo-Json1 $collections[$p.Collection].Title) +
               '","url":"' + (ConvertTo-Json1 $url) +
               '","text":"' + (ConvertTo-Json1 (ConvertTo-Plain $s.Html)) + '"}'
    }
  }
  $js = "window.SEARCH_INDEX = [`n" + ($rows -join ",`n") + "`n];`n"
  Write-Host ("    search index: {0} sections, {1:n0} bytes" -f $rows.Count, $js.Length)
  $js
}

# Playlists as DATA, not as rendered documents.
#
# A presentation used to be a second rendering of the same content into slide
# markup. That copy did not load app.js at all, so its 25 checklist items were
# dead text - the interactivity existed only on the real page. Shipping the
# order as data instead means the sequence is applied TO the real pages: next
# and previous move between them, and presentation mode is a view of the page
# rather than a substitute for it. Adding a page or an interactive feature
# needs no presentation code, because there is none to change.
function New-PlaylistData {
  $rows = @()

  # "Everything" is a playlist too - the user's framing: a lesson is a
  # playlist, a course is a playlist, the whole program is a playlist. It is
  # generated, not authored, so it can never fall behind the page set. An
  # authored deck named 'everything' wins over it.
  if (-not $decks.Contains('everything')) {
    $allItems = @()
    foreach ($c in $collections.Values) {
      $groupNames = if ($c.Groups.Count) { $c.Groups }
                    else { @($c.PageIds | ForEach-Object { $pages[$_].Section } | Select-Object -Unique) }
      foreach ($g in $groupNames) {
        foreach ($p in @($c.PageIds | ForEach-Object { $pages[$_] } | Where-Object { $_.Section -eq $g } | Sort-Object Title)) {
          $allItems += '{"id":"' + (ConvertTo-Json1 $p.Id) +
                       '","title":"' + (ConvertTo-Json1 $p.Title) +
                       '","collection":"' + (ConvertTo-Json1 $c.Title) +
                       '","group":"' + (ConvertTo-Json1 $c.Title) +
                       '","url":"' + (ConvertTo-Json1 ($c.Id + '/' + $p.Id + '.html')) + '"}'
        }
      }
    }
    $rows += '{"name":"everything","title":"Everything","auto":true,"items":[' + ($allItems -join ',') + ']}'
  }

  foreach ($d in $decks.Values) {
    $items = @()
    $group = ''
    foreach ($item in $d.Items) {
      if ($item.Kind -eq 'divider') { $group = $item.Value; continue }
      $p = $pages[$item.Value]
      $items += '{"id":"' + (ConvertTo-Json1 $p.Id) +
                '","title":"' + (ConvertTo-Json1 $p.Title) +
                '","collection":"' + (ConvertTo-Json1 $collections[$p.Collection].Title) +
                '","group":"' + (ConvertTo-Json1 $group) +
                '","url":"' + (ConvertTo-Json1 ($p.Collection + '/' + $p.Id + '.html')) + '"}'
    }
    $rows += '{"name":"' + (ConvertTo-Json1 $d.Name) +
             '","title":"' + (ConvertTo-Json1 $d.Title) +
             '","items":[' + ($items -join ',') + ']}'
  }
  $js = "window.PLAYLISTS = [`n" + ($rows -join ",`n") + "`n];`n"
  Write-Host ("    playlists: {0}, {1:n0} bytes" -f $rows.Count, $js.Length)
  $js
}

# ------------------------------------------------------------ landing page ---
Write-Host 'site'
$searchJs   = New-SearchIndex 'site'
$playlistJs = New-PlaylistData
$script:stamp = Get-BuildStamp @(
  $searchJs
  $playlistJs
  [System.IO.File]::ReadAllText((Join-Path $themeDir 'msu-theme.css'))
  [System.IO.File]::ReadAllText((Join-Path $themeDir 'app.css'))
  [System.IO.File]::ReadAllText((Join-Path $themeDir 'app.js'))
)
Write-Host ("    build stamp: {0}" -f $script:stamp)
$hub = New-Object System.Text.StringBuilder
[void]$hub.AppendLine('<a class="skip" href="#main">Skip to content</a>')
[void]$hub.AppendLine((New-AppBar ''))
[void]$hub.AppendLine('<div class="shell">')
[void]$hub.AppendLine((New-Sidebar '' '' '' 'site' ''))
[void]$hub.AppendLine('<main id="main"><div class="article wide">')
[void]$hub.AppendLine('  <div class="stamp">' + (New-Lockup '' 'logo') + '</div>')
[void]$hub.AppendLine('  <h1>' + (ConvertTo-HtmlText $site.TITLE) + '</h1>')
[void]$hub.AppendLine('  <p class="lede">' + (ConvertTo-HtmlText $site.SUMMARY) + '</p>')
[void]$hub.AppendLine('  <h2 class="section-head">Sections</h2>')
[void]$hub.AppendLine('  <div class="grid">')
foreach ($c in $collections.Values) {
  $ready = @($c.PageIds | Where-Object { $pages[$_].Status -eq 'ready' }).Count
  [void]$hub.AppendLine('    <a class="tile big" href="' + $c.Id + '/index.html">')
  [void]$hub.AppendLine('      <span class="t">' + (ConvertTo-HtmlText $c.Title) + '</span>')
  [void]$hub.AppendLine('      <span class="s">' + (ConvertTo-HtmlText $c.Summary) + '</span>')
  [void]$hub.AppendLine('      <span class="n">' + (Format-Count $ready 'page') + '</span>')
  [void]$hub.AppendLine('    </a>')
}
[void]$hub.AppendLine('  </div>')
[void]$hub.AppendLine('  <h2 class="section-head">Presentations</h2>')
[void]$hub.AppendLine('  <p class="aside">A presentation is a <strong>playlist</strong> &mdash; an ordered selection of the topics above, not a separate copy of them. Edit a topic once and every playlist using it follows.</p>')
[void]$hub.AppendLine('  <div class="grid">')
foreach ($d in $decks.Values) {
  [void]$hub.AppendLine('    <a class="tile" href="presentations.html#pl-' + $d.Name + '">')
  [void]$hub.AppendLine('      <span class="t">' + (ConvertTo-HtmlText $d.Title) + '</span>')
  [void]$hub.AppendLine('      <span class="s">' + (ConvertTo-HtmlText $d.Subtitle) + '</span>')
  [void]$hub.AppendLine('      <span class="n">' + (Format-Count $d.PageIds.Count 'topic') + ' &middot; ' +
                        (Format-Count (Get-DeckSlideCount $d) 'slide') + '</span>')
  [void]$hub.AppendLine('    </a>')
}
[void]$hub.AppendLine('  </div>')
[void]$hub.AppendLine('</div></main>')
[void]$hub.AppendLine('</div>')
Write-Out (Join-Path $docsDir 'index.html') `
          (New-Document $site.TITLE 'app skin-app' $hub.ToString() '' 'home' (& $siteHead '') (& $siteScripts ''))

Write-Out (Join-Path $docsDir '.nojekyll') ''
Write-Out (Join-Path $docsDir 'search-index.js') $searchJs
Write-Out (Join-Path $docsDir 'playlists.js') $playlistJs

# ------------------------------------------------------- presentations ------
# A playlist view, not a page of content. Each presentation shows its ordered
# track list - the topics it draws on, in order, with the slide count each
# contributes - plus one control to start the player. The tracks link to the
# topic pages, because the topic is the thing that exists; the deck is a way
# of walking them.
$pi = New-Object System.Text.StringBuilder
[void]$pi.AppendLine('<a class="skip" href="#main">Skip to content</a>')
[void]$pi.AppendLine((New-AppBar ''))
[void]$pi.AppendLine('<div class="shell">')
[void]$pi.AppendLine((New-Sidebar '' '' '' 'site' ''))
[void]$pi.AppendLine('<main id="main"><div class="article wide">')
[void]$pi.AppendLine('  <div class="crumb"><a href="index.html">' + (ConvertTo-HtmlText $site.TITLE) +
                     '</a><span class="sep">/</span><span>Presentations</span></div>')
[void]$pi.AppendLine('  <h1>Presentations</h1>')
[void]$pi.AppendLine('  <p class="lede">A presentation is a playlist: an ordered selection of topics, not a copy of them. Change a topic and every playlist that uses it changes with it.</p>')

foreach ($d in $decks.Values) {
  [void]$pi.AppendLine('  <section class="playlist" id="pl-' + $d.Name + '">')
  [void]$pi.AppendLine('    <div class="pl-head">')
  [void]$pi.AppendLine('      <div class="pl-meta">')
  [void]$pi.AppendLine('        <h2>' + (ConvertTo-HtmlText $d.Title) + '</h2>')
  if ($d.Subtitle) { [void]$pi.AppendLine('        <p class="aside">' + (ConvertTo-HtmlText $d.Subtitle) + '</p>') }
  [void]$pi.AppendLine('        <p class="pl-stat">' + (Format-Count $d.PageIds.Count 'topic') + ' &middot; ' +
                       (Format-Count (Get-DeckSlideCount $d) 'panel') + '</p>')
  [void]$pi.AppendLine('      </div>')
  # Both entry points land on the FIRST REAL PAGE of the playlist. There is no
  # separate deck document to open - presentation mode is a view of the page.
  $firstId = @($d.Items | Where-Object { $_.Kind -eq 'page' } | Select-Object -First 1).Value
  $fp   = $pages[$firstId]
  $href = $fp.Collection + '/' + $fp.Id + '.html?p=' + $d.Name
  [void]$pi.AppendLine('      <div class="pl-actions">')
  [void]$pi.AppendLine('        <a class="btn-play" href="' + $href + '">Start reading</a>')
  [void]$pi.AppendLine('        <a class="btn-alt" href="' + $href + '&amp;present=1">Presentation mode</a>')
  [void]$pi.AppendLine('      </div>')
  [void]$pi.AppendLine('    </div>')
  [void]$pi.AppendLine('    <ol class="tracks">')
  $tn = 0
  foreach ($item in $d.Items) {
    if ($item.Kind -eq 'divider') {
      [void]$pi.AppendLine('      <li class="track-group">' + (ConvertTo-HtmlText $item.Value) + '</li>')
      continue
    }
    $tn++
    $p = $pages[$item.Value]
    [void]$pi.AppendLine('      <li class="track">')
    [void]$pi.AppendLine('        <span class="tn">' + $tn + '</span>')
    [void]$pi.AppendLine('        <a class="tt" href="' + $p.Collection + '/' + $p.Id + '.html">' +
                         (ConvertTo-HtmlText $p.Title) + '</a>')
    [void]$pi.AppendLine('        <span class="tc">' + (ConvertTo-HtmlText $collections[$p.Collection].Title) + '</span>')
    [void]$pi.AppendLine('        <span class="ts">' + (Format-Count (Get-PageSlideCount $p) 'slide') + '</span>')
    [void]$pi.AppendLine('      </li>')
  }
  [void]$pi.AppendLine('    </ol>')
  [void]$pi.AppendLine('  </section>')
}
[void]$pi.AppendLine('</div></main>')
[void]$pi.AppendLine('</div>')
Write-Out (Join-Path $docsDir 'presentations.html') `
          (New-Document ("Presentations - " + $site.TITLE) 'app skin-app' $pi.ToString() '' 'presentations' (& $siteHead '') (& $siteScripts ''))

# ---------------------------------------------- collection index + pages -----
foreach ($c in $collections.Values) {
  $cd = Join-Path $docsDir $c.Id

  $ci = New-Object System.Text.StringBuilder
  [void]$ci.AppendLine('<a class="skip" href="#main">Skip to content</a>')
  [void]$ci.AppendLine((New-AppBar '../'))
  [void]$ci.AppendLine('<div class="shell">')
  [void]$ci.AppendLine((New-Sidebar '../' '' $c.Id 'site' ''))
  [void]$ci.AppendLine('<main id="main"><div class="article wide">')
  [void]$ci.AppendLine('  <div class="crumb"><a href="../index.html">' + (ConvertTo-HtmlText $site.TITLE) +
                       '</a><span class="sep">/</span><span>' + (ConvertTo-HtmlText $c.Title) + '</span></div>')
  [void]$ci.AppendLine('  <h1>' + (ConvertTo-HtmlText $c.Title) + '</h1>')
  [void]$ci.AppendLine('  <p class="lede">' + (ConvertTo-HtmlText $c.Summary) + '</p>')
  $groupNames = if ($c.Groups.Count) { $c.Groups }
                else { @($c.PageIds | ForEach-Object { $pages[$_].Section } | Select-Object -Unique) }
  foreach ($g in $groupNames) {
    $inGroup = @($c.PageIds | ForEach-Object { $pages[$_] } | Where-Object { $_.Section -eq $g } | Sort-Object Title)
    if (-not $inGroup.Count) { continue }
    [void]$ci.AppendLine('  <h2 class="section-head">' + (ConvertTo-HtmlText $g) + '</h2>')
    [void]$ci.AppendLine((New-Tiles $inGroup '../' $c.Id 'site'))
  }
  [void]$ci.AppendLine('</div></main>')
  [void]$ci.AppendLine('</div>')
  Write-Out (Join-Path $cd 'index.html') `
            (New-Document ("$($c.Title) - $($site.TITLE)") 'app skin-app' $ci.ToString() '../' ("coll-" + $c.Id) (& $siteHead '../') (& $siteScripts '../'))

  foreach ($pageId in $c.PageIds) {
    $p   = $pages[$pageId]
    $ctx = [pscustomobject]@{ Coll = $c.Id }
    $sb  = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine('<a class="skip" href="#main">Skip to content</a>')
    [void]$sb.AppendLine((New-AppBar '../'))
    [void]$sb.AppendLine('<div class="shell has-toc">')
    [void]$sb.AppendLine((New-Sidebar '../' $p.Id $c.Id 'site' ''))
    [void]$sb.AppendLine('<main id="main"><div class="article">')
    [void]$sb.AppendLine('  <div class="crumb"><a href="../index.html">' + (ConvertTo-HtmlText $site.TITLE) +
                         '</a><span class="sep">/</span><a href="index.html">' + (ConvertTo-HtmlText $c.Title) +
                         '</a><span class="sep">/</span><span>' + (ConvertTo-HtmlText $p.Section) + '</span></div>')
    [void]$sb.AppendLine('  <h1>' + (ConvertTo-HtmlText $p.Title) +
                         $(if ($p.Status -ne 'ready') { ' <span class="pill">' + (ConvertTo-HtmlText $p.Status) + '</span>' } else { '' }) + '</h1>')
    [void]$sb.AppendLine('  <p class="lede">' + (ConvertTo-HtmlText $p.Summary) + '</p>')
    [void]$sb.AppendLine((New-Cards $p $ctx 'site-page'))

    [void]$sb.AppendLine('  <div class="usedin">')
    if ($p.Decks.Count -gt 0) {
      [void]$sb.AppendLine('    <div class="k">Appears in</div>')
      [void]$sb.AppendLine('    <div class="chips">')
      foreach ($dn in ($p.Decks | Select-Object -Unique)) {
        [void]$sb.AppendLine('      <a class="chip" href="' + $p.Id + '.html?p=' + $dn + '">' +
                             (ConvertTo-HtmlText $decks[$dn].Title) + '</a>')
      }
      [void]$sb.AppendLine('    </div>')
    } else {
      [void]$sb.AppendLine('    <div class="k">Not in any presentation yet</div>')
    }
    [void]$sb.AppendLine('  </div>')
    [void]$sb.AppendLine('</div></main>')
    [void]$sb.AppendLine((New-Toc $p))
    [void]$sb.AppendLine('</div>')
    Write-Out (Join-Path $cd "$($p.Id).html") `
              (New-Document ("$($p.Title) - $($site.TITLE)") 'app skin-app' $sb.ToString() '../' $p.Id (& $siteHead '../') (& $siteScripts '../'))
  }
}

# ---------------------------------------------------------- theme + assets ---
Write-Host 'theme'
foreach ($f in (Get-ChildItem -LiteralPath $themeDir -File)) {
  Write-Out (Join-Path $docsDir ('theme\' + $f.Name)) ([System.IO.File]::ReadAllText($f.FullName))
}
# The site links the logo rather than inlining it, so it has to be copied.
$outAssets = Join-Path $docsDir 'assets'
if (-not (Test-Path -LiteralPath $outAssets)) { New-Item -ItemType Directory -Path $outAssets -Force | Out-Null }
foreach ($f in (Get-ChildItem -LiteralPath (Join-Path $root 'assets') -File)) {
  $dest = Join-Path $outAssets $f.Name
  [void]$script:written.Add($dest)
  $same = (Test-Path -LiteralPath $dest) -and
          ((Get-Item -LiteralPath $dest).Length -eq $f.Length)
  if ($WhatIf) { Write-Host ("  {0,-46} {1}" -f ('docs\assets\' + $f.Name), $(if ($same) { 'unchanged' } else { 'would COPY' })) }
  elseif (-not $same) { Copy-Item -LiteralPath $f.FullName -Destination $dest -Force
                        Write-Host ("  {0,-46} {1:n0} bytes" -f ('docs\assets\' + $f.Name), $f.Length) }
}

# ----------------------------------------------------------------- bundle ----
if ($Bundle) {
  Write-Host 'bundle'
  $bundleDir = Join-Path $root 'bundle'
  $themeCss  = [System.IO.File]::ReadAllText((Join-Path $themeDir 'msu-theme.css'))
  $appCss    = [System.IO.File]::ReadAllText((Join-Path $themeDir 'app.css'))
  $appJs     = [System.IO.File]::ReadAllText((Join-Path $themeDir 'app.js'))
  $bundleIdx = New-SearchIndex 'bundle'
  $bundleExtra = @'

/* ---- single-file bundle only: every page stacked in one document -------- */
.article.bundled { border-top: 3px solid var(--accent); padding-top: 2rem; margin-top: 3rem; }
.article.bundled:first-of-type { border-top: 0; margin-top: 0; padding-top: 0; }
@media print { .article.bundled { break-before: page; } }
'@

  function New-BundleDocument([string]$title, [string]$css, [string]$bodyClass, [string]$content, [string]$pageKey, [string]$js) {
    $sb = New-Object System.Text.StringBuilder
    [void]$sb.AppendLine('<!DOCTYPE html>')
    [void]$sb.AppendLine('<html lang="en">')
    [void]$sb.AppendLine('<head>')
    [void]$sb.AppendLine('<meta charset="utf-8">')
    [void]$sb.AppendLine('<meta name="viewport" content="width=device-width, initial-scale=1">')
    [void]$sb.AppendLine('<title>' + (ConvertTo-HtmlText $title) + '</title>')
    [void]$sb.AppendLine($fontLink.Trim())
    [void]$sb.AppendLine($themeBoot.Trim())
    [void]$sb.AppendLine('<style>')
    [void]$sb.AppendLine($css.TrimEnd())
    [void]$sb.AppendLine('</style>')
    [void]$sb.AppendLine('</head>')
    [void]$sb.AppendLine('<body class="' + $bodyClass + '" data-page="' + $pageKey + '" data-base="">')
    [void]$sb.AppendLine($content.TrimEnd())
    if ($js) { [void]$sb.AppendLine('<script>'); [void]$sb.AppendLine($js.TrimEnd()); [void]$sb.AppendLine('</script>') }
    [void]$sb.AppendLine('</body>')
    [void]$sb.AppendLine('</html>')
    $sb.ToString()
  }

  foreach ($c in $collections.Values) {
    $ctx = [pscustomobject]@{ Coll = $c.Id }
    $bw  = New-Object System.Text.StringBuilder
    [void]$bw.AppendLine('<a class="skip" href="#main">Skip to content</a>')
    [void]$bw.AppendLine((New-AppBar '' 'bundle'))
    [void]$bw.AppendLine('<div class="shell">')
    [void]$bw.AppendLine((New-Sidebar '' '' $c.Id 'bundle' $c.Id))
    [void]$bw.AppendLine('<main id="main">')
    [void]$bw.AppendLine('<div class="article wide" id="top">')
    [void]$bw.AppendLine('  <div class="stamp">' + $lockupData + '</div>')
    [void]$bw.AppendLine('  <h1>' + (ConvertTo-HtmlText $c.Title) + '</h1>')
    [void]$bw.AppendLine('  <p class="lede">' + (ConvertTo-HtmlText $c.Summary) + '</p>')
    $groupNames = if ($c.Groups.Count) { $c.Groups }
                  else { @($c.PageIds | ForEach-Object { $pages[$_].Section } | Select-Object -Unique) }
    foreach ($g in $groupNames) {
      $inGroup = @($c.PageIds | ForEach-Object { $pages[$_] } | Where-Object { $_.Section -eq $g } | Sort-Object Title)
      if (-not $inGroup.Count) { continue }
      [void]$bw.AppendLine('  <h2 class="section-head">' + (ConvertTo-HtmlText $g) + '</h2>')
      [void]$bw.AppendLine((New-Tiles $inGroup '' $c.Id 'bundle'))
    }
    [void]$bw.AppendLine('</div>')

    foreach ($g in $groupNames) {
      foreach ($p in @($c.PageIds | ForEach-Object { $pages[$_] } | Where-Object { $_.Section -eq $g } | Sort-Object Title)) {
        [void]$bw.AppendLine('<div class="article bundled" id="p-' + $p.Id + '">')
        [void]$bw.AppendLine('  <div class="crumb"><span>' + (ConvertTo-HtmlText $p.Section) + '</span></div>')
        [void]$bw.AppendLine('  <h1>' + (ConvertTo-HtmlText $p.Title) +
                             $(if ($p.Status -ne 'ready') { ' <span class="pill">' + (ConvertTo-HtmlText $p.Status) + '</span>' } else { '' }) + '</h1>')
        [void]$bw.AppendLine('  <p class="lede">' + (ConvertTo-HtmlText $p.Summary) + '</p>')
        [void]$bw.AppendLine((New-Cards $p $ctx 'bundle-coll'))
        [void]$bw.AppendLine('  <div class="usedin"><a class="chip" href="#top">Back to contents</a></div>')
        [void]$bw.AppendLine('</div>')
      }
    }
    [void]$bw.AppendLine('</main>')
    [void]$bw.AppendLine('</div>')
    Write-Out (Join-Path $bundleDir ($c.Id + '.html')) `
              (New-BundleDocument ("$($c.Title) - $($site.TITLE)") ($themeCss + "`n" + $appCss + $bundleExtra) `
                                  'app skin-app' $bw.ToString() ('bundle-' + $c.Id) ($bundleIdx + "`n" + $appJs))
  }

}

# ----------------------------------------------------------- stale output ----
# The generator only ever wrote; it never removed. Renaming six pages left six
# stale files in docs\ that GitHub Pages would keep serving at their old URLs,
# carrying outdated content with no source left to update them - and nothing
# said so.
#
# Reporting is the default because silence was the actual bug. Deletion is
# opt-in via -Prune: docs\ is generated output, reproducible in full by one
# command, but it is not a scratch surface and this script should not remove
# files from it unasked.
$orphans = @()
if (Test-Path -LiteralPath $docsDir) {
  foreach ($f in (Get-ChildItem -LiteralPath $docsDir -Recurse -File -Force)) {
    if (-not $script:written.Contains($f.FullName)) { $orphans += $f.FullName }
  }
}
if ($orphans.Count) {
  Write-Host ''
  Write-Host ("stale files in docs\ - not produced by this build ({0}):" -f $orphans.Count)
  foreach ($o in $orphans) { Write-Host ("  {0}" -f $o.Substring($root.Length).TrimStart('\')) }
  if ($Prune -and -not $WhatIf) {
    foreach ($o in $orphans) { Remove-Item -LiteralPath $o -Force }
    Write-Host ("  removed {0}" -f $orphans.Count)
  } else {
    Write-Host '  re-run with -Prune to remove them'
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
