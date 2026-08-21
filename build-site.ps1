<#
    build-site.ps1 - render the CourseWiki site: landing page, collections, and tracks.

    THE MODEL
      A PAGE is one topic, authored once, as an @@FIELD: header plus a stack of
      <section> blocks. It lives in collections\<coll>\pages\<id>.html.

      A COLLECTION is a section of the site. It gets its own folder, its own
      index, and its own URL.

      A TRACK is a playlist in tracks\<name>.track. It is an ordered selection of
      real pages, with topic, course, and program tracks composed through includes
      and @@PARENT. The generated site applies a track at runtime with ?p=<track>;
      &present=1 presents the same page DOM as full-screen panels. Every <section>
      becomes one web card and one presentation panel.

      A LINK is [[page-id]] or [[page-id|text]]. Ids are unique site-wide, and
      one authored link resolves to five destinations - see Resolve-Links.

      An IMAGE is [[img:file.png|Alt text]] - the same link syntax in an
      `img:` namespace, so it rides the same Resolve-Links seam and the same
      switch on output mode. Source files live in media\.

    WHAT THE GENERATOR ADDS THAT THE SOURCE DOES NOT CARRY
      Each authored <section> is wrapped in <details class="xcard"> for the web
      render. That is done HERE, not in the sources, so that:
        - runtime playlist and presentation mode need no second copy,
        - the same source stays printable and presentation-ready,
        - disclosure works with JavaScript off, because <details> is native.

    OUTPUT
      docs\         the site. GitHub Pages serves it from main/docs with no CI.
      docs\print\  self-contained section and track aggregates, with CSS, JS, and
                    logos inlined. Print these for PDF or upload them standalone.

    Usage
      pwsh -File .\build-site.ps1
      pwsh -File .\build-site.ps1 -Prune
      pwsh -File .\build-site.ps1 -SiteUrl "https://example.org/coursewiki"
      pwsh -File .\build-site.ps1 -WhatIf
#>
[CmdletBinding()]
param(
  # Remove files in docs that this build did not produce (renamed or deleted
  # sources leave stale pages that Pages would keep serving).
  [switch] $Prune,
  [string] $SiteUrl,
  [switch] $WhatIf
)

$ErrorActionPreference = 'Stop'
$root     = $PSScriptRoot
$collDir  = Join-Path $root 'collections'
$trackDir = Join-Path $root 'tracks'
$practiceDir = Join-Path $root 'practice'
$themeDir = Join-Path $root 'theme'
$mediaDir = Join-Path $root 'media'
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

# The image formats this site will inline. The MIME type has to be right per
# extension: a data: URI carrying the wrong type is not decoded, and the
# aggregate that fails is the PDF fallback nobody opens until they need it.
$script:mediaMime = [ordered]@{
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'
  '.svg'  = 'image/svg+xml'
}
function Get-MediaMime([string]$path) {
  $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
  if (-not $script:mediaMime.Contains($ext)) { return $null }
  $script:mediaMime[$ext]
}

function Get-FileSha1([string]$path) {
  $sha = [System.Security.Cryptography.SHA1]::Create()
  try {
    (($sha.ComputeHash([System.IO.File]::ReadAllBytes($path)) |
        ForEach-Object { $_.ToString('x2') }) -join '')
  } finally { $sha.Dispose() }
}

function Get-DataUri([string]$relPath) {
  $p = Join-Path $root $relPath
  if (-not (Test-Path -LiteralPath $p)) { throw "missing asset: $p" }
  $mime = Get-MediaMime $p
  if (-not $mime) {
    throw "no MIME type for '$p' - supported: $(($script:mediaMime.Keys) -join ', ')"
  }
  "data:$mime;base64," + [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($p))
}

# ONE regex for the authored link/image token, used by the resolver and by the
# end-of-build report. Two copies of this pattern would be free to drift, and a
# report that scans for something slightly different from what the renderer
# resolved is a report that can miss exactly the case it exists to catch.
$script:linkRx = '\[\[([^\]\|]+)(?:\|([^\]]+))?\]\]'
$script:imgPrefix = 'img:'

# A token inside an HTML comment is not content, and must not resolve or be
# validated. An author sketching a slot for artwork that does not exist yet -
#   <!-- GRAPHIC-SLOT: [[img:cord-routing.svg|the safe route]] -->
# - was failing the build on a picture nobody had claimed to have added. Found
# within the hour of shipping the image checks, by the first person to use them.
# Matched FIRST in the alternation below so a comment is consumed whole and
# whatever is inside it is never looked at.
$script:commentRx = '(?s)<!--.*?-->'

$script:written = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)

# The binary sibling of Write-Out. Registering in $script:written is the whole
# reason it exists rather than a bare WriteAllBytes: an unregistered file is
# reported as an orphan and -Prune deletes it on the next run.
function Write-OutBytes([string]$path, [byte[]]$bytes) {
  [void]$script:written.Add($path)
  $dir = Split-Path $path -Parent
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  $name = $path.Substring($root.Length).TrimStart('\')
  if ($WhatIf) {
    $same = (Test-Path -LiteralPath $path) -and
            ([System.IO.File]::ReadAllBytes($path).Length -eq $bytes.Length) -and
            (-not (Compare-Object ([System.IO.File]::ReadAllBytes($path)) $bytes -SyncWindow 0))
    $state = if (-not (Test-Path -LiteralPath $path)) { 'would CREATE' }
             elseif ($same) { 'unchanged' } else { 'would CHANGE' }
    Write-Host ("  {0,-46} {1}" -f $name, $state)
    return
  }
  [System.IO.File]::WriteAllBytes($path, $bytes)
  Write-Host ("  {0,-46} {1:n0} bytes" -f $name, $bytes.Length)
}

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

# A file the SITE links rather than inlines has to be copied into docs\, and
# every copy MUST be registered in $script:written - otherwise the stale-output
# check at the end reports it as an orphan and -Prune deletes it on the next
# run. assets\ (the lockups) and media\ (page images) are the same operation
# over two trees, so they share one function rather than two loops that can
# drift apart.
#
# Sameness is length AND content hash. Length alone would skip a re-export that
# happens to land on the same byte count, leaving docs\ disagreeing with its
# source - the same shape of silent staleness as the search index.
function Copy-StaticTree([string]$srcDir, [string]$destDir, [string]$label, [string[]]$onlyExt) {
  if (-not (Test-Path -LiteralPath $srcDir)) { return }
  foreach ($f in (Get-ChildItem -LiteralPath $srcDir -Recurse -File | Sort-Object FullName)) {
    if ($onlyExt.Count -and ($onlyExt -notcontains $f.Extension.ToLowerInvariant())) { continue }
    $rel  = $f.FullName.Substring($srcDir.Length).TrimStart('\')
    $dest = Join-Path $destDir $rel
    [void]$script:written.Add($dest)
    $same = (Test-Path -LiteralPath $dest) -and
            ((Get-Item -LiteralPath $dest).Length -eq $f.Length) -and
            ((Get-FileSha1 $dest) -eq (Get-FileSha1 $f.FullName))
    $name = $label + '\' + $rel
    if ($WhatIf) {
      Write-Host ("  {0,-46} {1}" -f $name, $(if ($same) { 'unchanged' } else { 'would COPY' }))
      continue
    }
    if ($same) { continue }
    $dir = Split-Path $dest -Parent
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    Copy-Item -LiteralPath $f.FullName -Destination $dest -Force
    Write-Host ("  {0,-46} {1:n0} bytes" -f $name, $f.Length)
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

# Display order for tracks: a programme, then the courses inside it, then the
# subject tracks those courses pull from. Alphabetical would interleave them
# and lose the hierarchy the reader needs to see.
$script:kindRank = @{ program = 0; course = 1; topic = 2 }
function Get-TrackRank($t) {
  $r = $script:kindRank[$t.Kind]
  if ($null -eq $r) { $r = 3 }
  $r
}
function Get-KindLabel([string]$k) {
  switch ($k) { 'program' { 'Program' } 'course' { 'Course' } default { 'Topic' } }
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
    # Optional. A collection may open with authored content of its own -
    # a hero, a visual index, whatever the subject needs - before its topic
    # grid. It is a normal content file, so [[links]] resolve in it, and a
    # collection without one simply has no intro.
    Intro = $(
      $ip = Join-Path $cdir 'intro.html'
      if (Test-Path -LiteralPath $ip) { [System.IO.File]::ReadAllText($ip).Trim() } else { '' }
    )
  }
  Write-Host ("collection {0,-10} {1} pages" -f $cid, $ids.Count)
}

# ----------------------------------------------------------- practice banks --
# Practice problems are deliberately NOT collection pages. A teaching page is
# still the canonical explanation, while practice\ is a bank of small,
# reusable problems that a reader can collect into a session. Keeping the bank
# outside collections prevents a problem from becoming a normal track item
# merely because the page that explains it is in a track.
#
# A bank is a normal @@ header followed by HTML. Each root problem needs:
#   data-practice data-practice-id data-practice-title data-practice-source
# The source is a PAGE id, not a collection or track id. The authored root may
# have any ordinary HTML tag and may be nested in section groups.
function Get-HtmlAttribute([string]$attrs, [string]$name) {
  $rx = '(?is)(?:^|\s)' + [regex]::Escape($name) +
        '(?=\s|=|/|$)(?:\s*=\s*(?:"(?<dq>[^"]*)"|''(?<sq>[^'']*)''|(?<bare>[^\s"''=<>]+)))?'
  $m = [regex]::Match($attrs, $rx)
  if (-not $m.Success) { return $null }
  if ($m.Groups['dq'].Success) { return $m.Groups['dq'].Value }
  if ($m.Groups['sq'].Success) { return $m.Groups['sq'].Value }
  if ($m.Groups['bare'].Success) { return $m.Groups['bare'].Value }
  ''
}

# This is a small tag balancer, rather than a <div>...</div> regex: bank items
# naturally contain panels and answer rows nested in the same kind of tag as
# their root. Regex alone would stop at the first inner close and silently cut
# off the problem that gets rendered and indexed.
function Find-HtmlElementEnd([string]$html, [int]$start, [string]$tag) {
  $rx = [regex]::new($script:commentRx + '|</?' + [regex]::Escape($tag) + '\b[^>]*>')
  $depth = 0
  foreach ($m in $rx.Matches($html, $start)) {
    $text = $m.Value
    if ($text.StartsWith('<!--', [StringComparison]::Ordinal)) { continue }
    if ($text -match '^</') {
      $depth--
      if ($depth -eq 0) { return $m.Index + $m.Length }
      continue
    }
    if ($text -notmatch '/\s*>$') { $depth++ }
  }
  -1
}

$practiceItems = @()
$practiceIds = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
$practiceDomIds = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
if (Test-Path -LiteralPath $practiceDir) {
  $bankIds = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::OrdinalIgnoreCase)
  foreach ($f in (Get-ChildItem -LiteralPath $practiceDir -Filter '*.html' | Sort-Object Name)) {
    $bank = Read-Conf $f.FullName
    foreach ($req in 'ID','TITLE') {
      if (-not $bank.Meta.ContainsKey($req) -or -not $bank.Meta[$req]) { throw "$($f.Name): missing @@$req" }
    }
    if ($bank.Meta.ID -ne [IO.Path]::GetFileNameWithoutExtension($f.Name)) {
      throw "$($f.Name): @@ID '$($bank.Meta.ID)' does not match the filename"
    }
    if (-not $bankIds.Add($bank.Meta.ID)) { throw "duplicate practice bank id '$($bank.Meta.ID)'" }

    # Consume comments whole before looking for tags so an author can comment
    # out a draft problem without publishing or validating its inner markup.
    $openRx = [regex]::new($script:commentRx + '|<(?<tag>[A-Za-z][A-Za-z0-9:-]*)\b(?<attrs>[^<>]*)>')
    foreach ($open in $openRx.Matches($bank.Body)) {
      if ($open.Value.StartsWith('<!--', [StringComparison]::Ordinal)) { continue }
      $attrs = $open.Groups['attrs'].Value
      if ($null -eq (Get-HtmlAttribute $attrs 'data-practice')) { continue }
      $id = Get-HtmlAttribute $attrs 'data-practice-id'
      $title = Get-HtmlAttribute $attrs 'data-practice-title'
      $source = Get-HtmlAttribute $attrs 'data-practice-source'
      foreach ($pair in @(@{ Name = 'data-practice-id'; Value = $id },
                             @{ Name = 'data-practice-title'; Value = $title },
                             @{ Name = 'data-practice-source'; Value = $source })) {
        if (-not $pair.Value -or -not $pair.Value.Trim()) { throw "$($f.Name): [data-practice] is missing $($pair.Name)" }
      }
      $id = $id.Trim(); $title = $title.Trim(); $source = $source.Trim()
      if ($id -match '\s') { throw "$($f.Name): practice id '$id' may not contain whitespace" }
      if (-not $practiceIds.Add($id)) { throw "duplicate practice id '$id' - practice ids must be unique site-wide" }
      if (-not $pages.Contains($source)) { throw "$($f.Name): practice '$id' names unknown data-practice-source page '$source'" }
      if ($pages[$source].Id -cne $source) {
        throw "$($f.Name): practice '$id' has data-practice-source '$source' with the wrong case; use '$($pages[$source].Id)' for GitHub Pages"
      }

      $end = Find-HtmlElementEnd $bank.Body $open.Index $open.Groups['tag'].Value
      if ($end -lt 0) { throw "$($f.Name): [data-practice] '$id' has no closing </$($open.Groups['tag'].Value)>" }
      $markup = $bank.Body.Substring($open.Index, $end - $open.Index).Trim()
      $domId = Get-HtmlAttribute $attrs 'id'
      foreach ($tagMatch in $openRx.Matches($markup)) {
        if ($tagMatch.Value.StartsWith('<!--', [StringComparison]::Ordinal)) { continue }
        $markupDomId = Get-HtmlAttribute $tagMatch.Groups['attrs'].Value 'id'
        if ($null -eq $markupDomId) { continue }
        if (-not $markupDomId.Trim()) { throw "$($f.Name): practice '$id' contains an empty id attribute" }
        if (-not $practiceDomIds.Add($markupDomId)) {
          throw "duplicate practice DOM id '$markupDomId' - labels and fragment links would be ambiguous"
        }
      }
      # If the authored root does not already carry the stable practice id,
      # New-PracticeItemMarkup emits a neighboring fragment anchor with it.
      # Reserve that generated id in the same global set now.
      if ($domId -ne $id -and -not $practiceDomIds.Add($id)) {
        throw "practice '$id' cannot create its fragment anchor because that DOM id is already in use"
      }
      $practiceItems += [pscustomobject]@{
        Id = $id; Title = $title; Source = $source; Bank = $bank.Meta.ID
        BankTitle = $bank.Meta.TITLE; DomId = $domId; Html = $markup; File = $f.Name
      }
    }
  }
}
Write-Host ("practice: {0} item{1}" -f $practiceItems.Count, $(if ($practiceItems.Count -eq 1) { '' } else { 's' }))

# ----------------------------------------------------------------- tracks ----
# A TRACK is an ordered selection of pages. Three levels are in use, and each
# one is an ordinary track - the level only says what it contains:
#
#   @@KIND: program   a programme - DET - which CONTAINS its courses
#   @@KIND: course    a class within it - DET 130 - which CARRIES topic tracks
#   @@KIND: topic     a subject a course carries, e.g. general-safety
#
# TWO EDGES, and they are not the same relation:
#
#   @@PARENT: det       DOWNWARD. DET 130 is PART OF DET. Containment.
#   + general-safety    SIDEWAYS. DET 130 CARRIES General Safety, which stays a
#                       track of its own you can also read whole. That is how
#                       Safety appears in every class without being copied into
#                       any of them - edit it once and every course follows.
#
# CONTAINMENT IS DECLARED ONCE, AND CONTENT FLOWS UP IT. A track that has
# children takes its page list FROM them - see Expand-Track. So det.track lists
# nothing at all: DET is DET 130, DET 330 and DET 403 because those three say
# @@PARENT: det, and when one of them diverges DET follows on the next build
# with no edit anywhere.
#
# It used to restate its children's content with '+' lines of its own, and that
# is precisely the fork this system exists to prevent: a hand-kept list one
# level up goes silently wrong the moment a course changes. Nothing looked
# broken either - all four tracks resolved to an identical eleven pages, which
# is what a flat copy looks like when the courses have not diverged yet.
#
# A track with children therefore may not carry content lines of its own. That
# is a build error rather than a merge, for the same reason: a '+' one level up
# either restates a child (a fork) or hides content in the container where no
# course carries it (invisible to every student who opens their own class).
$rawTracks = [ordered]@{}
foreach ($f in (Get-ChildItem -LiteralPath $trackDir -Filter '*.track' | Sort-Object Name)) {
  $dc = Read-Conf $f.FullName
  foreach ($req in 'TRACK','TITLE') {
    if (-not $dc.Meta.ContainsKey($req)) { throw "$($f.Name): missing @@$req" }
  }
  $lines = @()
  foreach ($line in ($dc.Body -split "`r?`n")) {
    $t = $line.Trim()
    if ($t -eq '' -or $t.StartsWith('#')) { continue }
    $lines += $t
  }
  $rawTracks[$dc.Meta.TRACK] = [pscustomobject]@{
    Name = $dc.Meta.TRACK; Title = $dc.Meta.TITLE
    Kind     = if ($dc.Meta.ContainsKey('KIND'))     { $dc.Meta.KIND }     else { 'topic' }
    Parent   = if ($dc.Meta.ContainsKey('PARENT'))   { $dc.Meta.PARENT }   else { '' }
    Subtitle = if ($dc.Meta.ContainsKey('SUBTITLE')) { $dc.Meta.SUBTITLE } else { '' }
    Footer   = if ($dc.Meta.ContainsKey('FOOTER'))   { $dc.Meta.FOOTER }   else { $site.FOOTER }
    # The DIRECT '+' includes, kept as well as flattened. Flattening alone
    # loses the fact that DET 130 carries General Safety BY REFERENCE, and
    # that fact is the sideways link a reader needs: the course is where you
    # are, the topic track is a thing of its own you can also read whole.
    Includes = @($lines | Where-Object { $_.StartsWith('+') } | ForEach-Object { $_.Substring(1).Trim() })
    Lines = $lines; File = $f.Name
  }
}

# The hierarchy, read off @@PARENT. It is built from the RAW tracks because
# expansion needs it - a parent's content comes from its children, so the tree
# cannot wait until the tracks are expanded. One map, one order: the sidebar,
# the track index and the derivation below all walk children through here, so
# the order a reader sees IS the order a derived list is assembled in.
$script:rawKids = @{}
foreach ($rt in $rawTracks.Values) {
  $k = if ($rt.Parent) { $rt.Parent } else { '' }
  if (-not $script:rawKids.ContainsKey($k)) { $script:rawKids[$k] = @() }
  $script:rawKids[$k] += $rt
}
function Get-RawKids([string]$name) {
  if (-not $script:rawKids.ContainsKey($name)) { return @() }
  @($script:rawKids[$name] | Sort-Object @{e={Get-TrackRank $_}}, Title)
}

# Structure checks, before anything is expanded - each one guards a step of the
# expansion that would otherwise fail late, or not at all.
foreach ($rt in $rawTracks.Values) {
  if ($rt.Parent) {
    if (-not $rawTracks.Contains($rt.Parent)) {
      throw "$($rt.File): @@PARENT '$($rt.Parent)' is not a track"
    }
    # @@PARENT was validated for EXISTENCE only, which was enough while the
    # tree was just a display order. It is a recursion path now, so a loop in
    # it is a hang: walk up and refuse a repeat.
    $chainP = @($rt.Name); $up = $rt.Parent
    while ($up) {
      if ($chainP -contains $up) { throw "$($rt.File): @@PARENT cycle: $(($chainP + $up) -join ' -> ')" }
      $chainP += $up; $up = $rawTracks[$up].Parent
    }
  }
  if ((Get-RawKids $rt.Name).Count -and $rt.Lines.Count) {
    # Parenthesised because -f binds tighter than +: without them only the
    # last literal is formatted and the message ships its own {0} to the user.
    throw (("{0}: '{1}' has child tracks, so its pages come from them - remove the {2} content line(s) here. " +
            "A '+' or a page id one level up either restates what a child already carries (a fork, silent the " +
            "moment the child changes) or hides content where no course carries it.") -f $rt.File, $rt.Name, $rt.Lines.Count)
  }
}

# Resolve a track to its ordered items. Two ways in, and the check above makes
# them exclusive:
#
#   WITH children     the union of the children, in the order Get-RawKids gives
#                     them - which is the order the sidebar draws them in.
#   WITHOUT children  its own lines, with '+' includes flattened in place.
#
# Both edges travel in $chain, so a cycle by either route - or a mixture, a
# course that '+' includes its own programme - is a build error, not a hang.
function Expand-Track([string]$name, $chain) {
  if ($chain -contains $name) { throw "track cycle: $($chain -join ' -> ') -> $name" }
  $rt = $rawTracks[$name]
  if (-not $rt) { throw "unknown track '$name'" }
  $kids = Get-RawKids $name
  if ($kids.Count) {
    $out = @()
    foreach ($k in $kids) {
      $sub = @(Expand-Track $k.Name ($chain + @($name)))
      # A child's own group headings travel up with its pages, so the
      # programme reads as the courses do. A child that contributes pages
      # under no heading of its own gets one carrying its title - without it
      # those pages would sit under whichever heading the PREVIOUS child
      # happened to end on, which is a claim about the wrong course.
      if ($sub.Count -and $sub[0].Kind -ne 'divider') {
        $out += [pscustomobject]@{ Kind = 'divider'; Value = $k.Title }
      }
      $out += $sub
    }
    return $out
  }
  $out = @()
  foreach ($t in $rt.Lines) {
    if ($t.StartsWith('>')) {
      $out += [pscustomobject]@{ Kind = 'divider'; Value = $t.Substring(1).Trim() }
    } elseif ($t.StartsWith('+')) {
      $inc = $t.Substring(1).Trim()
      if (-not $rawTracks.Contains($inc)) { throw "$($rt.File): includes unknown track '$inc'" }
      $out += Expand-Track $inc ($chain + @($name))
    } else {
      if (-not $pages.Contains($t)) { throw "$($rt.File): lists unknown page '$t'" }
      $out += [pscustomobject]@{ Kind = 'page'; Value = $t }
    }
  }
  $out
}

$tracks = [ordered]@{}
foreach ($name in $rawTracks.Keys) {
  $rt = $rawTracks[$name]
  $items = @(Expand-Track $name @())
  # A page reached twice - two topic tracks sharing a page, or three courses
  # carrying the same safety track - would be walked twice in the sequence.
  # FIRST OCCURRENCE WINS, so a page sits where the reader first meets it.
  $seen = [System.Collections.Generic.HashSet[string]]::new()
  $dedup = @(); foreach ($it in $items) {
    if ($it.Kind -eq 'page') { if (-not $seen.Add($it.Value)) { continue } }
    $dedup += $it
  }
  # A heading whose pages were ALL dropped as repeats would print as an empty
  # group. Three courses carrying one safety track give the programme three
  # copies of "The Universal Rules", two of them with nothing underneath.
  $items = @(); $sawPage = $false
  for ($i = $dedup.Count - 1; $i -ge 0; $i--) {
    $it = $dedup[$i]
    if ($it.Kind -eq 'divider') {
      if (-not $sawPage) { continue }
      $sawPage = $false
    } else { $sawPage = $true }
    $items = @($it) + $items
  }
  $ids = @($items | Where-Object Kind -eq 'page' | ForEach-Object Value)
  # An empty track is not a smaller track, it is a broken one: a hub tile, a
  # sidebar entry and a #pl- section all get rendered for it, and the track
  # index reads the FIRST page to build its two entry buttons. Say so here,
  # where the file that caused it can be named.
  if (-not $ids.Count) {
    throw (("{0}: '{1}' resolves to no pages. List a page, '+' a track it carries, or give it child tracks " +
            "that declare @@PARENT: {1} - as it stands it would render as a tile and a playlist with nothing " +
            "behind them.") -f $rt.File, $name)
  }
  foreach ($pid2 in $ids) { [void]$pages[$pid2].Decks.Add($name) }

  $tracks[$name] = [pscustomobject]@{
    Name = $name; Title = $rt.Title; Kind = $rt.Kind; Parent = $rt.Parent
    Subtitle = $rt.Subtitle; Footer = $rt.Footer
    Includes = $rt.Includes
    Items = $items; PageIds = $ids
    # Practice is a separate collection relation. These ids are a union over
    # the teaching pages in this track, not synthetic `items`, so the reader's
    # normal topic sequence and presentation panels cannot acquire problems.
    PracticeIds = @($practiceItems | Where-Object { $ids -contains $_.Source } | ForEach-Object Id)
  }
}

# The two edges, as lookups the renderers share. @@PARENT gives the tree, the
# '+' includes give the sideways edges, and both are validated above - so
# anything returned here is known to resolve.
#
# Kids come off the SAME map the derivation used, mapped to the expanded
# tracks. A second copy of the hierarchy could sort differently from the one
# the pages were assembled in, and the sidebar would then disagree with the
# playlist it links to.
function Get-TrackKids([string]$name) {
  @(Get-RawKids $name | ForEach-Object { $tracks[$_.Name] })
}
function Get-TrackIncludes($t) {
  @($t.Includes | Where-Object { $tracks.Contains($_) })
}
Write-Host ("tracks: {0}" -f $tracks.Count)
foreach ($t in $tracks.Values) {
  Write-Host ("    {0,-28} {1,-8} {2} pages{3}" -f $t.Name, $t.Kind, $t.PageIds.Count,
              $(if ($t.Parent) { "  (in $($t.Parent))" } else { '' }))
}

# ------------------------------------------------------------------ media ----
# Source images live in media\ and are indexed here, BEFORE the build stamp is
# computed, because the stamp has to cover them: an image edited on its own
# would otherwise keep its old ?v= and a returning reader would keep the old
# picture. That is the search-index staleness failure again, in a new asset.
#
# The lookup is ORDINAL, deliberately. Windows would happily resolve
# [[img:Hazard.png]] to media\hazard.png and the build would look clean, then
# GitHub Pages - case-sensitive - would 404 it. A case-only mismatch is
# reported as an error here, with the correction, rather than shipping.
$script:media    = [System.Collections.Generic.Dictionary[string,object]]::new([StringComparer]::Ordinal)
$script:mediaCi  = [System.Collections.Generic.Dictionary[string,string]]::new([StringComparer]::OrdinalIgnoreCase)
$script:mediaSkipped = @()
$mediaStampParts = @()
if (Test-Path -LiteralPath $mediaDir) {
  foreach ($f in (Get-ChildItem -LiteralPath $mediaDir -Recurse -File | Sort-Object FullName)) {
    $rel  = $f.FullName.Substring($mediaDir.Length).TrimStart('\').Replace('\', '/')
    $mime = Get-MediaMime $f.FullName
    if (-not $mime) {
      if ($f.Name -ne 'README.md') { $script:mediaSkipped += $rel }
      continue
    }
    $sha = Get-FileSha1 $f.FullName
    $script:media[$rel] = [pscustomobject]@{
      Rel = $rel; Full = $f.FullName; Mime = $mime; Sha = $sha; DataUri = $null
    }
    if (-not $script:mediaCi.ContainsKey($rel)) { $script:mediaCi[$rel] = $rel }
    $mediaStampParts += "$rel|$sha"
  }
}
Write-Host ("media: {0} image{1}" -f $script:media.Count, $(if ($script:media.Count -eq 1) { '' } else { 's' }))

# -------------------------------------------------------- link resolution ----
# Two containers for one authored token, and the SAME switch decides both what
# a [[page-id]] points at and where an [[img:file]] comes from:
#
#   site-page   docs\<coll>\<id>.html   link -> sibling, or ..\<other>\<id>.html
#                                       img  -> ..\media\<file>?v=<stamp>
#   aggregate   docs\print\<slug>.html  link -> #p-<id> inside, else absolute URL
#                                       img  -> data:<mime>;base64,...
#
# The aggregate is handed out as ONE file - it is the PDF fallback and it is
# uploaded to Canvas on its own - so a relative image path would break it
# exactly where the site being unreachable is the reason it exists. A site page
# gets the real file so the browser caches it once instead of carrying the
# bytes in every page that shows it.

# An image reference. Alt text is the link label and it is REQUIRED: this is
# teaching material, it gets read with a screen reader, and an unlabelled
# picture in a safety page is content that silently does not reach a reader.
# A missing file or a missing label is reported by the image scan at the end of
# the build; what is emitted here is the visible half of the same signal.
function New-ImageTag([string]$ref, [string]$alt, $ctx, [string]$mode) {
  $rec = $null
  if (-not $script:media.TryGetValue($ref, [ref]$rec)) {
    return '<span class="img-missing" title="No image file media\' + (ConvertTo-HtmlText $ref) + '">' +
           (ConvertTo-HtmlText $(if ($alt) { $alt } else { $ref })) + '</span>'
  }
  switch ($mode) {
    'site-page' { $src = $ctx.Up + 'media/' + $rec.Rel + '?v=' + $script:stamp }
    'practice-page' { $src = $ctx.Up + 'media/' + $rec.Rel + '?v=' + $script:stamp }
    'aggregate' {
      if (-not $rec.DataUri) {
        $rec.DataUri = "data:$($rec.Mime);base64," +
                       [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($rec.Full))
      }
      $src = $rec.DataUri
    }
    default { throw "New-ImageTag: unknown mode '$mode'" }
  }
  '<img class="content-img" src="' + $src + '" alt="' + (ConvertTo-HtmlText $alt) + '"' +
  $(if ($alt) { '' } else { ' data-alt-missing="1"' }) + '>'
}

function Resolve-Links([string]$html, $ctx, [string]$mode) {
  # The comment branch is FIRST, so a comment is consumed whole and nothing
  # inside it is looked at. It stays literal in the output, which is what makes
  # a placeholder slot greppable in the source and in every generated copy.
  # Neither branch captures, so groups 1 and 2 are still the link's.
  [regex]::Replace($html, $script:commentRx + '|' + $script:linkRx, {
    param($m)
    if ($m.Value.StartsWith('<!--', [StringComparison]::Ordinal)) { return $m.Value }
    $id    = $m.Groups[1].Value.Trim()
    $label = if ($m.Groups[2].Success) { $m.Groups[2].Value.Trim() } else { $null }

    if ($id.StartsWith($script:imgPrefix, [StringComparison]::Ordinal)) {
      return New-ImageTag ($id.Substring($script:imgPrefix.Length).Trim()) $label $ctx $mode
    }

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
      'practice-page' {
        return '<a class="xref-page" href="' + $tp.Collection + '/' + $id + '.html">' + $text + '</a>'
      }
      # An aggregate holds a set of pages in one file. A link to a page inside
      # the same file is an anchor; anything outside it has to leave for the
      # live site, because there is no sibling file to reach.
      'aggregate' {
        if ($ctx.Ids.Contains($id)) { return '<a class="xref-page" href="#p-' + $id + '">' + $text + '</a>' }
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

# ------------------------------------------------------------- favicon -------
# Every page load was requesting /favicon.ico and getting a 404.
#
# THE DESIGN, and why it is not a letter. A favicon is read at 16 CSS pixels in
# a strip of other 16-pixel icons, and its whole job there is to be told apart.
# Letterforms at that size are a few pixels wide and all resolve to the same
# grey smudge; "CW" would be about three pixels per letter. The site already
# owns a signature graphic that is nothing BUT bold shape - the hazard stripe
# in the collection hero - and three thick diagonals survive any downscale.
# Two official colours, no third: Navy #002144 ground, Gold #ECAC00 bands.
# Gold on navy measures 7.6:1, and gold is never being asked to be type here,
# which is the rule it usually breaks.
#
# ONE geometry, expressed twice. The constants below are in a 32-unit square
# and every size scales them, so the .ico frames and the .svg are the same
# drawing rather than two drawings that can drift.
$script:favNavy   = @(0x00, 0x21, 0x44)   # R,G,B
$script:favGold   = @(0xEC, 0xAC, 0x00)
$script:favPeriod = 11.0                  # band pitch along (x+y), per 32 units
$script:favDuty   = 0.5                   # half gold, half navy - the hazard ratio
$script:favInset  = 2.0                   # navy frame, so the bands stop cleanly
                                          # instead of bleeding into a dark tab strip

# Is this sample point gold? Shared by both renderers, in 32-unit space.
function Test-FavGold([double]$x, [double]$y) {
  if ($x -lt $script:favInset -or $y -lt $script:favInset -or
      $x -gt (32 - $script:favInset) -or $y -gt (32 - $script:favInset)) { return $false }
  $t = ($x + $y) % $script:favPeriod
  if ($t -lt 0) { $t += $script:favPeriod }
  $t -lt ($script:favPeriod * $script:favDuty)
}

# The .svg is what a modern browser actually uses, at any size. Bands are
# strokes on constant-(x+y) lines, clipped to the inset square: stroke width is
# the band's (x+y) width divided by root 2, because the band is measured along
# the diagonal and the stroke across it.
function New-FaviconSvg {
  $w  = [Math]::Round($script:favPeriod * $script:favDuty / [Math]::Sqrt(2), 3)
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="CourseWiki">')
  [void]$sb.AppendLine('  <title>CourseWiki</title>')
  [void]$sb.AppendLine('  <rect width="32" height="32" fill="#002144"/>')
  [void]$sb.AppendLine('  <clipPath id="f"><rect x="2" y="2" width="28" height="28"/></clipPath>')
  [void]$sb.AppendLine('  <g clip-path="url(#f)" stroke="#ECAC00" stroke-width="' + $w + '">')
  for ($k = 0; $k -lt 7; $k++) {
    $c = $script:favPeriod * $k + $script:favPeriod * $script:favDuty / 2
    [void]$sb.AppendLine('    <line x1="' + [Math]::Round($c - 40, 3) + '" y1="40" x2="40" y2="' +
                         [Math]::Round($c - 40, 3) + '"/>')
  }
  [void]$sb.AppendLine('  </g>')
  [void]$sb.AppendLine('</svg>')
  $sb.ToString()
}

# The .ico exists for the request the browser makes on its own. Written by
# hand rather than pulled from a library: an ICO holding uncompressed 32-bit
# BGRA is a 6-byte directory, a 16-byte entry per frame, and a BMP header -
# no dependency, and the generator really emits it rather than the repo
# carrying a binary nobody can regenerate.
#
# Both 16 and 32 ship as NATIVE frames. Letting the browser scale 32 down to 16
# is what turns a diagonal into mud; each frame is drawn at its own size, and
# each pixel is 4x4 supersampled so the diagonals get real antialiasing.
function New-FaviconIcoBytes {
  $sizes  = @(16, 32)
  $images = @()
  foreach ($size in $sizes) {
    $rows = New-Object System.Collections.Generic.List[byte]
    # BMP pixel data is bottom-up.
    for ($py = $size - 1; $py -ge 0; $py--) {
      for ($px = 0; $px -lt $size; $px++) {
        $hits = 0
        for ($i = 0; $i -lt 4; $i++) {
          for ($j = 0; $j -lt 4; $j++) {
            $sx = ($px + ($i + 0.5) / 4.0) * 32.0 / $size
            $sy = ($py + ($j + 0.5) / 4.0) * 32.0 / $size
            if (Test-FavGold $sx $sy) { $hits++ }
          }
        }
        $a = $hits / 16.0
        # BGRA, opaque.
        $rows.Add([byte][Math]::Round($script:favNavy[2] * (1 - $a) + $script:favGold[2] * $a))
        $rows.Add([byte][Math]::Round($script:favNavy[1] * (1 - $a) + $script:favGold[1] * $a))
        $rows.Add([byte][Math]::Round($script:favNavy[0] * (1 - $a) + $script:favGold[0] * $a))
        $rows.Add([byte]255)
      }
    }
    # BITMAPINFOHEADER. Height is DOUBLED - the format still expects an AND
    # mask below the colour data even at 32bpp, and parsers that read the
    # header literally get a half-height image without it.
    $hdr = New-Object System.Collections.Generic.List[byte]
    $hdr.AddRange([BitConverter]::GetBytes([int]40))
    $hdr.AddRange([BitConverter]::GetBytes([int]$size))
    $hdr.AddRange([BitConverter]::GetBytes([int]($size * 2)))
    $hdr.AddRange([BitConverter]::GetBytes([int16]1))
    $hdr.AddRange([BitConverter]::GetBytes([int16]32))
    $hdr.AddRange([BitConverter]::GetBytes([int]0))            # BI_RGB
    $hdr.AddRange([BitConverter]::GetBytes([int]$rows.Count))
    0..3 | ForEach-Object { $hdr.AddRange([BitConverter]::GetBytes([int]0)) }

    $mask = New-Object System.Collections.Generic.List[byte]
    $maskRow = [Math]::Ceiling($size / 32.0) * 4          # rows padded to 32 bits
    for ($r = 0; $r -lt ($size * $maskRow); $r++) { $mask.Add([byte]0) }

    $img = New-Object System.Collections.Generic.List[byte]
    $img.AddRange($hdr); $img.AddRange($rows); $img.AddRange($mask)
    $images += ,@{ Size = $size; Bytes = $img.ToArray() }
  }

  $out = New-Object System.Collections.Generic.List[byte]
  $out.AddRange([BitConverter]::GetBytes([int16]0))            # reserved
  $out.AddRange([BitConverter]::GetBytes([int16]1))            # 1 = icon
  $out.AddRange([BitConverter]::GetBytes([int16]$images.Count))
  $offset = 6 + 16 * $images.Count
  foreach ($im in $images) {
    $out.Add([byte]$im.Size); $out.Add([byte]$im.Size)
    $out.Add([byte]0); $out.Add([byte]0)                       # palette, reserved
    $out.AddRange([BitConverter]::GetBytes([int16]1))          # planes
    $out.AddRange([BitConverter]::GetBytes([int16]32))         # bpp
    $out.AddRange([BitConverter]::GetBytes([int]$im.Bytes.Length))
    $out.AddRange([BitConverter]::GetBytes([int]$offset))
    $offset += $im.Bytes.Length
  }
  foreach ($im in $images) { $out.AddRange($im.Bytes) }
  $out.ToArray()
}

# On the SITE the icon is two real files; the .ico is there for the request the
# browser makes without being asked. In a BUNDLE there are no sibling files, so
# it is inlined - the same rule the lockup and the stylesheets already follow.
function New-FaviconLinks([string]$up) {
  '<link rel="icon" href="' + $up + 'favicon.ico" sizes="32x32">' + "`n" +
  '<link rel="icon" href="' + $up + 'favicon.svg?v=' + $script:stamp + '" type="image/svg+xml">'
}
$script:faviconSvg = New-FaviconSvg
$script:faviconInline = '<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,' +
  [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($script:faviconSvg)) + '">'

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
  [void]$sb.AppendLine('    <span class="sub" data-brandlabel>' + (ConvertTo-HtmlText $site.TITLE) + '</span>')
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

# A tree header has to do BOTH jobs: expand its branch AND go to the thing it
# names. Every collection and group header used to be a bare toggle, so
# docs\safety\index.html - a real section landing page - was reachable from
# nothing in the navigation.
#
# The shape: the <summary> owns the toggle (click anywhere on it, or Enter on
# it when focused), and an <a> inside owns the navigation (Tab reaches it
# separately, Enter follows it). Both actions are reachable by keyboard and
# neither hides the other. app.js keeps the link's click from also toggling -
# browsers disagree about that, and a stray toggle would be written into the
# open/closed memory on the way out of the page.
function New-NavSummary([string]$inner, [string]$href, [string]$after, [string]$linkAttrs) {
  '<summary><span class="chev"></span>' +
  $(if ($href) { '<a class="navself"' + $linkAttrs + ' href="' + $href + '">' + $inner + '</a>' }
    else       { '<span class="navself">' + $inner + '</span>' }) +
  $after + '</summary>'
}

# The Tracks tree, rendered from the SAME @@PARENT / @@KIND hierarchy the
# build already validates - and with the same <details> markup the topic tree
# uses, so the two blocks look and behave alike.
#
#   a node with children or includes -> <details>, like a collection
#   a node with neither              -> <li>, like a page
#
# Includes are rendered as a marked sideways list rather than as children:
# General Safety is not PART OF DET 130, it is a track of its own that DET 130
# carries. Flattening that distinction is what made the old list flat.
function Add-TrackNodes {
  param($nodes, [string]$plHref, $sb, [string]$pad, [int]$depth)
  $leaves = @()
  foreach ($t in $nodes) {
    $kids = Get-TrackKids $t.Name
    $incs = Get-TrackIncludes $t
    if (-not $kids.Count -and -not $incs.Count) { $leaves += $t; continue }
    $count = '<span class="count">' + $t.PageIds.Count + '</span>'
    [void]$sb.AppendLine($pad + '<details class="navgroup" data-nav="t-' + $t.Name + '"' +
                         $(if ($depth -eq 0) { ' open' } else { '' }) + '>')
    [void]$sb.AppendLine($pad + '  ' + (New-NavSummary (ConvertTo-HtmlText $t.Title) `
                                        ($plHref + '#pl-' + $t.Name) $count (' data-track="' + $t.Name + '"')))
    Add-TrackNodes $kids $plHref $sb ($pad + '  ') ($depth + 1)
    if ($incs.Count) {
      [void]$sb.AppendLine($pad + '  <ul class="navlist navinc">')
      foreach ($i in $incs) {
        $it = $tracks[$i]
        [void]$sb.AppendLine($pad + '    <li><a data-track="' + $it.Name + '" href="' + $plHref + '#pl-' + $it.Name + '">' +
                             (ConvertTo-HtmlText $it.Title) +
                             '<span class="count">' + $it.PageIds.Count + '</span></a></li>')
      }
      [void]$sb.AppendLine($pad + '  </ul>')
    }
    [void]$sb.AppendLine($pad + '</details>')
  }
  if ($leaves.Count) {
    [void]$sb.AppendLine($pad + '<ul class="navlist tracknav">')
    foreach ($t in $leaves) {
      [void]$sb.AppendLine($pad + '  <li><a data-track="' + $t.Name + '" href="' + $plHref + '#pl-' + $t.Name + '">' +
                           (ConvertTo-HtmlText $t.Title) +
                           '<span class="count">' + $t.PageIds.Count + '</span></a></li>')
    }
    [void]$sb.AppendLine($pad + '</ul>')
  }
}

# The side navigation. Nested <details> so it works with JavaScript off; JS
# only remembers which groups were left open.
# $mode 'site' -> real page links. 'bundle' -> in-file anchors for $onlyColl,
# absolute site links for everything else.
#
# Two blocks, each wrapped so the playlist code can address them: .nav-topics
# is the topic tree, .nav-tracks is the track tree. In track mode app.js
# swaps the topic tree for the playlist and KEEPS this same track tree as the
# up-chain - the alternative was rendering the tree a second time in JS, which
# is the parallel-renderer mistake the deck already taught this project.
function New-Sidebar([string]$up, [string]$curPage, [string]$curColl, [string]$mode, [string]$onlyColl) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<aside class="sidebar" id="sidebar">')
  [void]$sb.AppendLine('  <div class="nav-topics">')
  [void]$sb.AppendLine('  <h2>Topics</h2>')
  foreach ($c in $collections.Values) {
    $isCur = ($c.Id -eq $curColl)
    $open  = if ($isCur -or $collections.Count -le 2) { ' open' } else { '' }
    $cHref = if ($mode -eq 'bundle') { "$script:siteUrl/$($c.Id)/index.html" } else { "$up$($c.Id)/index.html" }
    [void]$sb.AppendLine('  <details class="navgroup" data-nav="c-' + $c.Id + '"' + $open + '>')
    [void]$sb.AppendLine('    ' + (New-NavSummary (ConvertTo-HtmlText $c.Title) $cHref '' ''))

    $groupNames = if ($c.Groups.Count) { $c.Groups }
                  else { @($c.PageIds | ForEach-Object { $pages[$_].Section } | Select-Object -Unique) }
    foreach ($g in $groupNames) {
      $inGroup = @($c.PageIds | ForEach-Object { $pages[$_] } | Where-Object { $_.Section -eq $g } | Sort-Object Title)
      if (-not $inGroup.Count) { continue }
      $gslug = ConvertTo-Slug "$($c.Id)-$g"
      # A group has no page of its own, but it does have a place: the block of
      # its topics on the collection index, which carries the same id.
      $gHref = $cHref + '#g-' + $gslug
      [void]$sb.AppendLine('    <details class="navgroup" data-nav="g-' + $gslug + '" open>')
      [void]$sb.AppendLine('      ' + (New-NavSummary (ConvertTo-HtmlText $g) $gHref '' ''))
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
  [void]$sb.AppendLine('  </div>')

  # Presentations are NOT topics, so they do not sit in the topic tree as a
  # peer of the collections. A presentation is a playlist - an ordered
  # selection OF the pages above, not a page of its own. It gets its own block
  # below the tree, and the link goes to the playlist (its track list), not
  # straight into the player.
  $plHref = if ($mode -eq 'bundle') { "$script:siteUrl/presentations.html" } else { "${up}presentations.html" }
  [void]$sb.AppendLine('  <div class="navsplit"></div>')
  [void]$sb.AppendLine('  <div class="nav-tracks">')
  [void]$sb.AppendLine('  <h2>Tracks</h2>')
  [void]$sb.AppendLine('  <p class="navnote">Tracks built from the topics above. A course carries the topic tracks it needs; a programme is its courses, so it follows them.</p>')
  Add-TrackNodes (Get-TrackKids '') $plHref $sb '  ' 0
  [void]$sb.AppendLine('  </div>')
  # Practice is a first-class site surface, but it is not a topic collection
  # or a track: it draws from both without changing either relation.
  [void]$sb.AppendLine('  <div class="navsplit"></div>')
  [void]$sb.AppendLine('  <div class="nav-practice"><h2>Practice</h2>')
  [void]$sb.AppendLine('    <ul class="navlist"><li><a href="' + $up + 'practice.html">Practice catalog</a></li></ul>')
  [void]$sb.AppendLine('  </div>')
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
$(New-FaviconLinks $up)
<link rel="stylesheet" href="${up}theme/msu-theme.css?v=$script:stamp">
<link rel="stylesheet" href="${up}theme/app.css?v=$script:stamp">
"@ }
$siteScripts = { param($up) @"
<script src="${up}search-index.js?v=$script:stamp"></script>
<script src="${up}playlists.js?v=$script:stamp"></script>
<script src="${up}practice-index.js?v=$script:stamp"></script>
<script src="${up}theme/app.js?v=$script:stamp"></script>
"@ }

# ---------------------------------------------------- section -> card --------
# Cards ship CLOSED. The instructor's reason is the whole decision: "we are
# going to add a lot of content, it will fill up quick." Open-by-default is
# comfortable on a page a reader deliberately chose and a wall of text on a
# page that is one of eighty; closed turns the summaries into a table of
# contents, which is what a reference page should open as.
#
# Three things depend on being able to force them open again, and all three
# already existed - this change is what makes them load-bearing rather than
# belt-and-braces:
#
#   * beforeprint in app.js, plus a CSS fallback for renderers that do not
#     fire it. A closed <details> prints its summary and NOTHING ELSE, and the
#     print output is the PDF safety fallback.
#   * presentation mode, where a closed panel is a blank slide.
#   * the hash reveal, which the search results depend on - every hit
#     deep-links to the card that holds it.
function New-Cards($p, $ctx, [string]$mode) {
  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<div class="cardtools">')
  [void]$sb.AppendLine('  <button type="button" data-act="expand">Expand all</button>')
  [void]$sb.AppendLine('  <button type="button" data-act="collapse">Collapse all</button>')
  [void]$sb.AppendLine('</div>')
  [void]$sb.AppendLine('<div class="cards">')
  foreach ($s in $p.Sections) {
    $cls = 'xcard'
    # The runtime can select deck modes without re-parsing authored sections.
    # In particular deck-wiki-only is visible on the topic page but excluded
    # from a presentation surface by its presentation rules.
    if ($s.Mode) { $cls += ' deck-' + $s.Mode }
    if ($s.Flag) { $cls += ' ' + $s.Flag }
    $head = if ($s.Head) { $s.Head } else { ConvertTo-HtmlText $p.Title }
    [void]$sb.AppendLine('  <details class="' + $cls + '" id="' + $s.Slug + '" data-card="' + $s.Slug + '">')
    [void]$sb.AppendLine('    <summary>' + $head + '<span class="chev"></span></summary>')
    [void]$sb.AppendLine('    <div class="body">')
    [void]$sb.AppendLine('      ' + (Resolve-Links $s.Html $ctx $mode))
    [void]$sb.AppendLine('    </div>')
    [void]$sb.AppendLine('  </details>')
  }
  [void]$sb.AppendLine('</div>')
  $sb.ToString()
}

# ------------------------------------------------ aggregate deeper addenda ----
# A `deeper` disclosure is useful on the web because it keeps supporting detail
# one click away from the main path. In a printable aggregate that same block
# belongs at the back of the document: leave a numbered pointer where the
# disclosure stood, then collect the resolved content in a matching addendum.
#
# This transforms the OUTPUT of New-Cards, after Resolve-Links has already done
# its container-dependent work. It therefore reuses the existing card renderer,
# aggregate anchors and data-URI image path rather than growing a second render
# path. The function is called only by New-Aggregate; site pages (including the
# presentation DOM layered over them) never pass through it.
function Convert-DeeperForAggregate([string]$html, $page, [System.Collections.ArrayList]$entries) {
  # Match comments first for the same reason Resolve-Links does: markup sketched
  # inside an authoring comment is not part of the document tree. Balance every
  # <details>, not just `.deeper`, because each deeper block is nested inside the
  # xcard that New-Cards generated and a non-greedy regex would stop at the wrong
  # closing tag as soon as another disclosure were nested inside it.
  $tagRx = [regex]::new(
    $script:commentRx + '|<details\b[^>]*>|</details\s*>',
    [Text.RegularExpressions.RegexOptions]::IgnoreCase
  )
  $stack  = [System.Collections.Stack]::new()
  $blocks = [System.Collections.ArrayList]::new()

  foreach ($tag in $tagRx.Matches($html)) {
    if ($tag.Value.StartsWith('<!--', [StringComparison]::Ordinal)) { continue }

    if ($tag.Value.StartsWith('</', [StringComparison]::Ordinal)) {
      if ($stack.Count -eq 0) {
        throw "aggregate deeper transform: unmatched </details> on page '$($page.Id)'"
      }
      $open = $stack.Pop()
      if ($open.IsDeeper) {
        [void]$blocks.Add([pscustomobject]@{
          Start      = $open.Start
          OpenEnd    = $open.End
          CloseStart = $tag.Index
          End        = $tag.Index + $tag.Length
        })
      }
      continue
    }

    $classMatch = [regex]::Match(
      $tag.Value,
      '(?is)\bclass\s*=\s*(?:"(?<dq>[^"]*)"|''(?<sq>[^'']*)'')'
    )
    $classes = if ($classMatch.Groups['dq'].Success) { $classMatch.Groups['dq'].Value }
               elseif ($classMatch.Groups['sq'].Success) { $classMatch.Groups['sq'].Value }
               else { '' }
    $isDeeper = [regex]::IsMatch($classes, '(?:^|\s)deeper(?:\s|$)')

    if ($isDeeper) {
      foreach ($ancestor in $stack) {
        if ($ancestor.IsDeeper) {
          throw "aggregate deeper transform: nested .deeper block on page '$($page.Id)'"
        }
      }
    }
    $stack.Push([pscustomobject]@{
      Start = $tag.Index
      End = $tag.Index + $tag.Length
      IsDeeper = $isDeeper
    })
  }

  if ($stack.Count -ne 0) {
    throw "aggregate deeper transform: unclosed <details> on page '$($page.Id)'"
  }

  # Closing tags discover nested blocks inside-out. Sort by the opening offset
  # before numbering so addenda always follow authored document order.
  $replacements = [System.Collections.ArrayList]::new()
  foreach ($block in ($blocks | Sort-Object Start)) {
    $inner = $html.Substring($block.OpenEnd, $block.CloseStart - $block.OpenEnd)
    $summary = [regex]::Match($inner, '(?is)<summary\b[^>]*>(?<text>.*?)</summary\s*>')
    if (-not $summary.Success) {
      throw "aggregate deeper transform: .deeper block without <summary> on page '$($page.Id)'"
    }

    $body = $inner.Remove($summary.Index, $summary.Length).Trim()
    $number = $entries.Count + 1
    $refId = "deeper-ref-$number"
    $addendumId = "deeper-addendum-$number"
    $summaryHtml = $summary.Groups['text'].Value.Trim()

    [void]$entries.Add([pscustomobject]@{
      Number          = $number
      RefId           = $refId
      AddendumId      = $addendumId
      PageId          = $page.Id
      PageTitle       = $page.Title
      CollectionTitle = $collections[$page.Collection].Title
      GroupTitle      = $page.Section
      SummaryHtml     = $summaryHtml
      BodyHtml        = $body
    })

    # Keep the authored summary outside the pointer link. A summary may itself
    # contain a resolved page link, and wrapping it would create nested anchors.
    $pointer = '<p class="deeper-ref" id="' + $refId + '">Supporting detail: ' +
               '<a href="#' + $addendumId + '"><strong>Addendum ' + $number +
               '</strong></a> &mdash; ' + $summaryHtml + '.</p>'
    [void]$replacements.Add([pscustomobject]@{
      Start = $block.Start
      End = $block.End
      Html = $pointer
    })
  }

  # Replace from the end so source offsets remain valid. No blocks is a normal,
  # explicit no-work result; the caller reports its zero alongside positive
  # aggregate counts rather than treating it as an error or a skipped state.
  foreach ($replacement in ($replacements | Sort-Object Start -Descending)) {
    $html = $html.Substring(0, $replacement.Start) + $replacement.Html +
            $html.Substring($replacement.End)
  }
  $html
}

function New-DeeperAddenda([System.Collections.ArrayList]$entries) {
  if ($entries.Count -eq 0) { return '' }

  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<section class="deeper-addenda" id="deeper-addenda" aria-labelledby="deeper-addenda-title">')
  [void]$sb.AppendLine('  <header class="deeper-addenda-head">')
  [void]$sb.AppendLine('    <div class="eyebrow">Supporting detail</div>')
  [void]$sb.AppendLine('    <h1 id="deeper-addenda-title">Addendum</h1>')
  [void]$sb.AppendLine('    <p class="lede">Additional evidence, standards context, and background referenced from the main text.</p>')
  [void]$sb.AppendLine('  </header>')
  [void]$sb.AppendLine('  <ol class="deeper-addenda-list">')
  foreach ($entry in $entries) {
    [void]$sb.AppendLine('    <li class="deeper-addendum" id="' + $entry.AddendumId + '" value="' + $entry.Number + '">')
    [void]$sb.AppendLine('      <article>')
    [void]$sb.AppendLine('        <div class="crumb"><span>' + (ConvertTo-HtmlText $entry.CollectionTitle) +
                         '</span><span class="sep">/</span><span>' + (ConvertTo-HtmlText $entry.GroupTitle) +
                         '</span><span class="sep">/</span><a href="#p-' + $entry.PageId + '">' +
                         (ConvertTo-HtmlText $entry.PageTitle) + '</a></div>')
    [void]$sb.AppendLine('        <h2><span class="deeper-addendum-number">Addendum ' + $entry.Number + '.</span> ' +
                         $entry.SummaryHtml + '</h2>')
    [void]$sb.AppendLine('        ' + $entry.BodyHtml)
    [void]$sb.AppendLine('        <p class="deeper-back"><a href="#' + $entry.RefId + '">Back to reference ' +
                         $entry.Number + '</a></p>')
    [void]$sb.AppendLine('      </article>')
    [void]$sb.AppendLine('    </li>')
  }
  [void]$sb.AppendLine('  </ol>')
  [void]$sb.AppendLine('</section>')
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
#
# WHAT THE INDEX STORES IS WHAT THE READER SEES, which is not what the source
# says. The source carries [[tokens]]; the page carries resolved text. Indexing
# the source shipped 31 raw tokens into student-facing result snippets - a
# search for "personal protective" returned "...all required personal
# protective equipment. See [[ppe]]." - and made a page id matchable as a
# string that appears on no page anywhere.
#
# The SAME token and the SAME two regexes as the renderer, on purpose: a second
# pattern here would be free to drift from what is actually rendered, and this
# file already carries that rule for the resolver. Different question, though -
# the renderer asks where a link POINTS, this asks what it READS AS - so this
# is a substitution, not a second copy of Resolve-Links:
#
#   [[id|label]]          -> label. The author's own prose, and exactly the
#                            text the page shows.
#   [[id]]                -> the target page's TITLE, again exactly what the
#                            page shows. The slug is never text.
#   [[id]], no such page  -> dropped. It renders as "page pending"; the slug of
#                            a page that does not exist is not something a
#                            student should be able to match on.
#   [[img:file|alt]]      -> alt. It is a real description, it is what a screen
#                            reader reads, and on a picture it is often the
#                            only words about what is in the frame. The
#                            filename goes.
#   <!-- ... -->          -> dropped whole, contents included - a comment is a
#                            placeholder and not content, which is the rule the
#                            renderer already follows. Keeps a GRAPHIC-SLOT
#                            marker and the token inside it out of the index.
function ConvertTo-IndexText([string]$html) {
  $t = [regex]::Replace($html, $script:commentRx + '|' + $script:linkRx, {
    param($m)
    if ($m.Value.StartsWith('<!--', [StringComparison]::Ordinal)) { return ' ' }
    $id    = $m.Groups[1].Value.Trim()
    $label = if ($m.Groups[2].Success) { $m.Groups[2].Value.Trim() } else { '' }
    if ($id.StartsWith($script:imgPrefix, [StringComparison]::Ordinal)) { return ' ' + $label + ' ' }
    if ($label) { return ' ' + $label + ' ' }
    if ($script:allPages.Contains($id)) { return ' ' + $script:allPages[$id].Title + ' ' }
    return ' '
  })
  # Stripping a tag or a token leaves a space where none belongs: "See
  # Personal Protective Equipment ." A snippet is read as a sentence, so close
  # the gap. 89 of these were already in the index from tag stripping alone.
  (ConvertTo-Plain $t) -replace '\s+([,.;:!?])', '$1'
}

function New-SearchIndex([string]$mode) {
  $rows = @()
  foreach ($p in $pages.Values) {
    foreach ($s in $p.Sections) {
      $head = if ($s.Head) { ConvertTo-IndexText $s.Head } else { $p.Title }
      $url  = if ($mode -eq 'bundle') { '#p-' + $p.Id } else { "$($p.Collection)/$($p.Id).html#$($s.Slug)" }
      $rows += '{"title":"' + (ConvertTo-Json1 $head) +
               '","page":"' + (ConvertTo-Json1 $p.Title) +
               '","summary":"' + (ConvertTo-Json1 $p.Summary) +
               '","collection":"' + (ConvertTo-Json1 $collections[$p.Collection].Title) +
               '","url":"' + (ConvertTo-Json1 $url) +
               '","text":"' + (ConvertTo-Json1 (ConvertTo-IndexText $s.Html)) + '"}'
    }
  }
  # Practice lives outside collections, but it is still reader-visible
  # teaching content. Each problem has a stable fragment URL in the catalog.
  foreach ($item in $practiceItems) {
    $rows += '{"title":"' + (ConvertTo-Json1 $item.Title) +
             '","page":"Practice","summary":"' + (ConvertTo-Json1 $pages[$item.Source].Title) +
             '","collection":"Practice","url":"practice.html#' + (ConvertTo-Json1 $item.Id) +
             '","text":"' + (ConvertTo-Json1 (ConvertTo-IndexText $item.Html)) + '"}'
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
  if (-not $tracks.Contains('everything')) {
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
    $allPracticeIds = @($practiceItems | ForEach-Object { '"' + (ConvertTo-Json1 $_.Id) + '"' })
    $rows += '{"name":"everything","title":"Everything","auto":true,"kind":"all","parent":"","includes":[],"items":[' +
             ($allItems -join ',') + '],"practiceIds":[' + ($allPracticeIds -join ',') + ']}'
  }

  foreach ($d in ($tracks.Values | Sort-Object @{e={Get-TrackRank $_}}, Title)) {
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
    # kind, parent and includes travel WITH the data. They were validated at
    # build time and then dropped, so the browser saw a flat list of seven
    # peers - DET, DET 130, DET 330, DET 403 - with the hierarchy that
    # distinguishes them nowhere in reach. The sidebar tree, the up-chain in
    # track mode and the another-class warning all read them from here.
    $incs = @(Get-TrackIncludes $d | ForEach-Object { '"' + (ConvertTo-Json1 $_) + '"' })
    $practiceIds = @($d.PracticeIds | ForEach-Object { '"' + (ConvertTo-Json1 $_) + '"' })
    $rows += '{"name":"' + (ConvertTo-Json1 $d.Name) +
             '","title":"' + (ConvertTo-Json1 $d.Title) +
             '","kind":"' + (ConvertTo-Json1 $d.Kind) +
             '","parent":"' + (ConvertTo-Json1 $d.Parent) +
             '","includes":[' + ($incs -join ',') +
             '],"items":[' + ($items -join ',') + '],"practiceIds":[' + ($practiceIds -join ',') + ']}'
  }
  $js = "window.TRACKS = [`n" + ($rows -join ",`n") + "`n];`n"
  Write-Host ("    playlists: {0}, {1:n0} bytes" -f $rows.Count, $js.Length)
  $js
}

# Metadata is a classic script rather than fetched JSON: file:// blocks fetch
# even for a neighboring file, while a script works both locally and on Pages.
# Markup remains server-rendered in practice.html so the catalog is useful
# without JavaScript and no parallel markup renderer can drift from it.
function New-PracticeData {
  $rows = @()
  foreach ($item in $practiceItems) {
    $rows += '{"id":"' + (ConvertTo-Json1 $item.Id) +
             '","title":"' + (ConvertTo-Json1 $item.Title) +
             '","source":"' + (ConvertTo-Json1 $item.Source) +
             '","sourceTitle":"' + (ConvertTo-Json1 $pages[$item.Source].Title) +
             '","bank":"' + (ConvertTo-Json1 $item.Bank) +
             '","url":"practice.html#' + (ConvertTo-Json1 $item.Id) + '"}'
  }
  $js = "window.PRACTICE_ITEMS = [`n" + ($rows -join ",`n") + "`n];`n"
  Write-Host ("    practice index: {0} items, {1:n0} bytes" -f $rows.Count, $js.Length)
  $js
}

function New-PracticeItemMarkup($item) {
  $id = ConvertTo-HtmlText $item.Id
  $title = ConvertTo-HtmlText $item.Title
  $source = $pages[$item.Source]
  $sourceLink = '<a class="xref-page" href="' + $source.Collection + '/' + $source.Id + '.html">' +
                (ConvertTo-HtmlText $source.Title) + '</a>'
  $select = '<label class="practice-catalog-select"><input type="checkbox" data-practice-select value="' + $id + '"> ' +
            'Add <span class="sr-only">' + $title + '</span> to practice</label>'
  # The selector belongs inside [data-practice], which keeps the runtime's
  # generic closest() lookup valid without a catalog-only special case.
  $resolved = Resolve-Links $item.Html ([pscustomobject]@{ Coll = ''; Up = '' }) 'practice-page'
  $html = [regex]::Replace($resolved, '^(?s)(<[^>]+>)', {
    param($m)
    $m.Value + "`n  " + $select
  })
  # Banks commonly set id to the stable practice id. If they do not, preserve
  # their DOM id and provide a harmless neighboring fragment target instead.
  $anchor = if ($item.DomId -eq $item.Id) { '' } else { '<span id="' + $id + '" aria-hidden="true"></span>' }
  $anchor + '<div class="practice-entry"><p class="practice-source">From ' + $sourceLink + '</p>' + "`n" + $html + "`n" + '</div>'
}

# ------------------------------------------------------------ landing page ---
Write-Host 'site'
$searchJs   = New-SearchIndex 'site'
$playlistJs = New-PlaylistData
$practiceJs = New-PracticeData
$script:stamp = Get-BuildStamp @(
  $searchJs
  $playlistJs
  $practiceJs
  [System.IO.File]::ReadAllText((Join-Path $themeDir 'msu-theme.css'))
  [System.IO.File]::ReadAllText((Join-Path $themeDir 'app.css'))
  [System.IO.File]::ReadAllText((Join-Path $themeDir 'app.js'))
  # The favicon is generated from one set of constants, so the SVG moving is
  # the same thing as the design moving - the .ico cannot change without it.
  $script:faviconSvg
  # Content hashes, not names: an image replaced in place must move the stamp,
  # or the page updates and the picture does not.
  ($mediaStampParts -join "`n")
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
[void]$hub.AppendLine('  <h2 class="section-head">Tracks</h2>')
[void]$hub.AppendLine('  <p class="aside">A presentation is a <strong>playlist</strong> &mdash; an ordered selection of the topics above, not a separate copy of them. Edit a topic once and every playlist using it follows.</p>')
[void]$hub.AppendLine('  <div class="grid">')
foreach ($d in ($tracks.Values | Sort-Object @{e={Get-TrackRank $_}}, Title)) {
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
Write-Out (Join-Path $docsDir 'practice-index.js') $practiceJs
# Both at the site root: the .svg because it is what a browser will use, the
# .ico because /favicon.ico is the request a browser makes without being told
# to - and that request was returning 404 on every single page load.
Write-Out (Join-Path $docsDir 'favicon.svg') $script:faviconSvg
Write-OutBytes (Join-Path $docsDir 'favicon.ico') (New-FaviconIcoBytes)

# ------------------------------------------------------ practice catalog ----
# This is intentionally a real document rather than an empty shell the client
# fills in. With scripts disabled, every problem, its prompt, and its teaching
# source remain readable; JavaScript only narrows the already-present catalog
# to a saved selection.
$practicePage = New-Object System.Text.StringBuilder
[void]$practicePage.AppendLine('<a class="skip" href="#main">Skip to content</a>')
[void]$practicePage.AppendLine((New-AppBar ''))
[void]$practicePage.AppendLine('<div class="shell">')
[void]$practicePage.AppendLine((New-Sidebar '' '' '' 'site' ''))
[void]$practicePage.AppendLine('<main id="main"><div class="article wide">')
[void]$practicePage.AppendLine('  <div class="crumb"><a href="index.html">' + (ConvertTo-HtmlText $site.TITLE) +
                              '</a><span class="sep">/</span><span>Practice</span></div>')
[void]$practicePage.AppendLine('  <h1>Practice</h1>')
[void]$practicePage.AppendLine('  <p class="lede">Build a practice session from problems tied to the topics you are studying.</p>')
[void]$practicePage.AppendLine('  <div class="practice-catalog" data-practice-catalog>')
if ($practiceItems.Count) {
  [void]$practicePage.AppendLine('    <div class="practice-session-tools">')
  [void]$practicePage.AppendLine('      <label>Start from a track <select data-practice-track><option value="">Choose a track</option>')
  foreach ($track in ($tracks.Values | Where-Object { $_.PracticeIds.Count } | Sort-Object @{e={Get-TrackRank $_}}, Title)) {
    [void]$practicePage.AppendLine('        <option value="' + (ConvertTo-HtmlText $track.Name) + '">' +
                                  (ConvertTo-HtmlText $track.Title) + '</option>')
  }
  [void]$practicePage.AppendLine('      </select></label>')
  [void]$practicePage.AppendLine('    </div>')
  [void]$practicePage.AppendLine('    <section class="practice-session" data-practice-session aria-labelledby="practice-session-title">')
  [void]$practicePage.AppendLine('      <div class="practice-session-head"><div><h2 id="practice-session-title">Practice session</h2>')
  [void]$practicePage.AppendLine('        <p data-practice-session-status aria-live="polite">Catalog view: ' + $practiceItems.Count + ' problems available.</p></div>')
  [void]$practicePage.AppendLine('        <div class="practice-session-actions"><button type="button" data-practice-run aria-pressed="false">Run selected practice</button>')
  [void]$practicePage.AppendLine('          <button type="button" data-practice-clear>Clear practice</button></div></div>')
  foreach ($item in $practiceItems) { [void]$practicePage.AppendLine((New-PracticeItemMarkup $item)) }
  [void]$practicePage.AppendLine('    </section>')
} else {
  [void]$practicePage.AppendLine('    <p>No practice problems have been published yet.</p>')
}
[void]$practicePage.AppendLine('  </div>')
[void]$practicePage.AppendLine('</div></main>')
[void]$practicePage.AppendLine('</div>')
Write-Out (Join-Path $docsDir 'practice.html') `
          (New-Document ("Practice - " + $site.TITLE) 'app skin-app' $practicePage.ToString() '' 'practice' (& $siteHead '') (& $siteScripts ''))

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
                     '</a><span class="sep">/</span><span>Tracks</span></div>')
[void]$pi.AppendLine('  <h1>Tracks</h1>')
[void]$pi.AppendLine('  <p class="lede">A presentation is a playlist: an ordered selection of topics, not a copy of them. Change a topic and every playlist that uses it changes with it.</p>')

foreach ($d in ($tracks.Values | Sort-Object @{e={Get-TrackRank $_}}, Title)) {
  [void]$pi.AppendLine('  <section class="playlist" id="pl-' + $d.Name + '">')
  [void]$pi.AppendLine('    <div class="pl-head">')
  [void]$pi.AppendLine('      <div class="pl-meta">')
  [void]$pi.AppendLine('        <h2>' + (ConvertTo-HtmlText $d.Title) + '</h2>')
  if ($d.Subtitle) { [void]$pi.AppendLine('        <p class="aside">' + (ConvertTo-HtmlText $d.Subtitle) + '</p>') }
  [void]$pi.AppendLine('        <p class="pl-stat"><span class="kind">' + (Get-KindLabel $d.Kind) + '</span>' +
                       $(if ($d.Parent) { ' in <a href="#pl-' + $d.Parent + '">' +
                                          (ConvertTo-HtmlText $tracks[$d.Parent].Title) + '</a>' } else { '' }) +
                       ' &middot; ' + (Format-Count $d.PageIds.Count 'topic') + ' &middot; ' +
                       (Format-Count (Get-DeckSlideCount $d) 'panel') + '</p>')

  # The sideways edges, made reachable. A course carries topic tracks by
  # reference and each one is also readable on its own; sibling courses exist
  # and were previously unreachable from here. A sibling is marked as leaving
  # for another class, because arriving in one unannounced is the surprise
  # this is meant to prevent.
  $incs = Get-TrackIncludes $d
  $kids = Get-TrackKids $d.Name
  $sibs = if ($d.Parent) { @(Get-TrackKids $d.Parent | Where-Object { $_.Name -ne $d.Name }) } else { @() }
  if ($kids.Count -or $incs.Count -or $sibs.Count) {
    [void]$pi.AppendLine('        <p class="pl-rel">')
    # DOWN first, because for a programme it is the whole of what it is: DET's
    # pages ARE its courses' pages. These are deliberately NOT marked as
    # another class - one of the three is probably the reader's own, and
    # inside DET's block there is no course context to be leaving.
    if ($kids.Count) {
      [void]$pi.AppendLine('          <span class="k">Contains</span>')
      foreach ($k in $kids) {
        [void]$pi.AppendLine('          <a class="chip" data-track="' + $k.Name + '" href="#pl-' + $k.Name + '">' +
                             (ConvertTo-HtmlText $k.Title) + '</a>')
      }
    }
    if ($incs.Count) {
      [void]$pi.AppendLine('          <span class="k">Carries</span>')
      foreach ($i in $incs) {
        [void]$pi.AppendLine('          <a class="chip" data-track="' + $i + '" href="#pl-' + $i + '">' +
                             (ConvertTo-HtmlText $tracks[$i].Title) + '</a>')
      }
    }
    if ($sibs.Count) {
      [void]$pi.AppendLine('          <span class="k">Also in ' +
                           (ConvertTo-HtmlText $tracks[$d.Parent].Title) + '</span>')
      # is-xcourse is stamped at BUILD time here because it is true relative to
      # the block you are reading - inside DET 130's block, DET 330 is another
      # class for anybody. app.js re-evaluates the same class relative to the
      # READER on every a[data-track], which is the case the build cannot see.
      foreach ($s in $sibs) {
        $xc = if ($d.Kind -eq 'course' -and $s.Kind -eq 'course') { ' is-xcourse' } else { '' }
        [void]$pi.AppendLine('          <a class="chip' + $xc + '" data-track="' + $s.Name + '" href="#pl-' + $s.Name + '">' +
                             (ConvertTo-HtmlText $s.Title) + '</a>')
      }
    }
    [void]$pi.AppendLine('        </p>')
  }
  [void]$pi.AppendLine('      </div>')
  # Both entry points land on the FIRST REAL PAGE of the playlist. There is no
  # separate deck document to open - presentation mode is a view of the page.
  $firstId = @($d.Items | Where-Object { $_.Kind -eq 'page' } | Select-Object -First 1).Value
  $fp   = $pages[$firstId]
  $href = $fp.Collection + '/' + $fp.Id + '.html?p=' + $d.Name
  [void]$pi.AppendLine('      <div class="pl-actions">')
  [void]$pi.AppendLine('        <a class="btn-play" href="' + $href + '">Start reading</a>')
  [void]$pi.AppendLine('        <a class="btn-alt" href="' + $href + '&amp;present=1">Presentation mode</a>')
  [void]$pi.AppendLine('        <a class="btn-alt" href="print/track-' + $d.Name + '.html">Print / PDF</a>')
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
  if ($c.Intro) {
    # Up is this document's depth below docs\ - docs\<coll>\index.html - and is
    # what an image reference is resolved against. Threaded the same way $up is
    # threaded through the app bar, the sidebar and the lockup, so a page moved
    # to another depth carries its images with it.
    [void]$ci.AppendLine((Resolve-Links $c.Intro ([pscustomobject]@{ Coll = $c.Id; Up = '../' }) 'site-page'))
  }
  $groupNames = if ($c.Groups.Count) { $c.Groups }
                else { @($c.PageIds | ForEach-Object { $pages[$_].Section } | Select-Object -Unique) }
  foreach ($g in $groupNames) {
    $inGroup = @($c.PageIds | ForEach-Object { $pages[$_] } | Where-Object { $_.Section -eq $g } | Sort-Object Title)
    if (-not $inGroup.Count) { continue }
    # Same slug the sidebar uses for this group's data-nav, so the group header
    # in the tree has somewhere real to point: this block, on this index.
    [void]$ci.AppendLine('  <h2 class="section-head" id="g-' + (ConvertTo-Slug "$($c.Id)-$g") + '">' +
                         (ConvertTo-HtmlText $g) + '</h2>')
    [void]$ci.AppendLine((New-Tiles $inGroup '../' $c.Id 'site'))
  }
  [void]$ci.AppendLine('</div></main>')
  [void]$ci.AppendLine('</div>')
  Write-Out (Join-Path $cd 'index.html') `
            (New-Document ("$($c.Title) - $($site.TITLE)") 'app skin-app' $ci.ToString() '../' ("coll-" + $c.Id) (& $siteHead '../') (& $siteScripts '../'))

  foreach ($pageId in $c.PageIds) {
    $p   = $pages[$pageId]
    $ctx = [pscustomobject]@{ Coll = $c.Id; Up = '../' }
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
      # data-track, so app.js can mark the ones that lead into ANOTHER CLASS.
      # This is the likeliest place a student clicks sideways out of their own
      # course - the page is class-neutral, so every chip here looks alike -
      # and which of them is "another class" depends on who is reading, which
      # the build cannot know.
      foreach ($dn in ($p.Decks | Select-Object -Unique)) {
        [void]$sb.AppendLine('      <a class="chip" data-track="' + $dn + '" href="' + $p.Id + '.html?p=' + $dn + '">' +
                             (ConvertTo-HtmlText $tracks[$dn].Title) + '</a>')
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
# The site links the logo and the page images rather than inlining them, so
# both trees are copied - and registered in $script:written, or the stale-file
# check would report every one of them and -Prune would delete them.
Copy-StaticTree (Join-Path $root 'assets') (Join-Path $docsDir 'assets') 'docs\assets' @()
Copy-StaticTree $mediaDir (Join-Path $docsDir 'media') 'docs\media' @($script:mediaMime.Keys)
if ($script:mediaSkipped.Count) {
  Write-Host ("  media\ files ignored - unsupported type ({0}): {1}" -f
              $script:mediaSkipped.Count, ($script:mediaSkipped -join ', '))
}

# -------------------------------------------------------------- aggregates ---
# One self-contained file holding an ordered set of pages, CSS and logo inlined,
# no sibling files at all. Two jobs, one mechanism:
#
#   * PDF fallback. The site is the primary surface, but a playlist has to be
#     printable as one clean document - print it from a browser, or render it
#     headless. The print stylesheet forces every collapsed card open, so
#     nothing is lost to a closed disclosure.
#   * Canvas / offline. Canvas rewrites the URL of every uploaded file, so
#     relative links between separately-uploaded files break. One file has none.
#
# A collection aggregate and a playlist aggregate are the SAME operation over a
# different selection, so they share this one function rather than growing a
# second renderer - which is exactly the mistake the deck made.
function New-Aggregate {
  param([string]$slug, [string]$title, [string]$summary, $pageList, [string]$kind)

  $ids = [System.Collections.Generic.HashSet[string]]::new()
  foreach ($p in $pageList) { [void]$ids.Add($p.Id) }
  $ctx = [pscustomobject]@{ Ids = $ids }
  $deeperEntries = [System.Collections.ArrayList]::new()

  $b = New-Object System.Text.StringBuilder
  [void]$b.AppendLine('<div class="agg-head" id="top">')
  [void]$b.AppendLine('  <div class="stamp">' + $lockupData + '</div>')
  [void]$b.AppendLine('  <div class="eyebrow">' + (ConvertTo-HtmlText $site.TAGLINE) +
                      ' &middot; ' + (ConvertTo-HtmlText $kind) + '</div>')
  [void]$b.AppendLine('  <h1>' + (ConvertTo-HtmlText $title) + '</h1>')
  if ($summary) { [void]$b.AppendLine('  <p class="lede">' + (ConvertTo-HtmlText $summary) + '</p>') }
  [void]$b.AppendLine('  <ol class="agg-toc">')
  foreach ($p in $pageList) {
    [void]$b.AppendLine('    <li><a href="#p-' + $p.Id + '">' + (ConvertTo-HtmlText $p.Title) + '</a></li>')
  }
  [void]$b.AppendLine('  </ol>')
  [void]$b.AppendLine('</div>')

  foreach ($p in $pageList) {
    [void]$b.AppendLine('<article class="article bundled" id="p-' + $p.Id + '">')
    [void]$b.AppendLine('  <div class="crumb"><span>' + (ConvertTo-HtmlText $collections[$p.Collection].Title) +
                        '</span><span class="sep">/</span><span>' + (ConvertTo-HtmlText $p.Section) + '</span></div>')
    [void]$b.AppendLine('  <h1>' + (ConvertTo-HtmlText $p.Title) +
                        $(if ($p.Status -ne 'ready') { ' <span class="pill">' + (ConvertTo-HtmlText $p.Status) + '</span>' } else { '' }) + '</h1>')
    [void]$b.AppendLine('  <p class="lede">' + (ConvertTo-HtmlText $p.Summary) + '</p>')
    $cards = New-Cards $p $ctx 'aggregate'
    [void]$b.AppendLine((Convert-DeeperForAggregate $cards $p $deeperEntries))
    [void]$b.AppendLine('</article>')
  }
  if ($deeperEntries.Count) {
    [void]$b.AppendLine((New-DeeperAddenda $deeperEntries))
  }

  $sb = New-Object System.Text.StringBuilder
  [void]$sb.AppendLine('<!DOCTYPE html>')
  [void]$sb.AppendLine('<html lang="en">')
  [void]$sb.AppendLine('<head>')
  [void]$sb.AppendLine('<meta charset="utf-8">')
  [void]$sb.AppendLine('<meta name="viewport" content="width=device-width, initial-scale=1">')
  [void]$sb.AppendLine('<title>' + (ConvertTo-HtmlText "$title - $($site.TITLE)") + '</title>')
  [void]$sb.AppendLine($script:faviconInline)
  [void]$sb.AppendLine($fontLink.Trim())
  [void]$sb.AppendLine($themeBoot.Trim())
  [void]$sb.AppendLine('<style>')
  [void]$sb.AppendLine($script:themeCss.TrimEnd())
  [void]$sb.AppendLine($script:appCss.TrimEnd())
  [void]$sb.AppendLine($script:aggCss.TrimEnd())
  [void]$sb.AppendLine('</style>')
  [void]$sb.AppendLine('</head>')
  [void]$sb.AppendLine('<body class="app skin-app aggregate" data-page="agg-' + $slug + '" data-base="">')
  [void]$sb.AppendLine('<main id="main">')
  [void]$sb.AppendLine($b.ToString().TrimEnd())
  [void]$sb.AppendLine('</main>')
  [void]$sb.AppendLine('<script>')
  [void]$sb.AppendLine($script:appJs.TrimEnd())
  [void]$sb.AppendLine('</script>')
  [void]$sb.AppendLine('</body>')
  [void]$sb.AppendLine('</html>')
  Write-Host ('    {0}: {1} source deeper block{2} -> {1} inline ref{2} + {1} addendum entr{3}' -f
              $slug, $deeperEntries.Count,
              $(if ($deeperEntries.Count -eq 1) { '' } else { 's' }),
              $(if ($deeperEntries.Count -eq 1) { 'y' } else { 'ies' }))
  Write-Out (Join-Path $docsDir ('print\' + $slug + '.html')) $sb.ToString()
}

Write-Host 'print / offline aggregates'
$script:themeCss = [System.IO.File]::ReadAllText((Join-Path $themeDir 'msu-theme.css'))
$script:appCss   = [System.IO.File]::ReadAllText((Join-Path $themeDir 'app.css'))
$script:appJs    = [System.IO.File]::ReadAllText((Join-Path $themeDir 'app.js'))
$script:aggCss   = @'

/* ---- aggregate: many pages stacked in one printable file --------------- */
.aggregate main { padding: clamp(1.5rem, 4vw, 3rem); max-width: 52rem; margin: 0 auto; }
.agg-head { margin-bottom: 3rem; }
.agg-head .logo { width: 15rem; margin-bottom: 1.25rem; }
.agg-toc { margin: 1.5rem 0 0; padding-left: 1.4rem; display: flex; flex-direction: column; gap: .3rem; }
.agg-toc li::before { content: none; }
.agg-toc a { font-family: var(--f-display); font-weight: 600; text-decoration: none; }
.article.bundled { border-top: 3px solid var(--accent); padding-top: 2rem; margin-top: 3rem; }
.deeper-ref {
  margin: .35rem 0; padding: .65rem .85rem;
  border-left: 3px solid var(--accent); background: var(--surface-2);
  font-family: var(--f-display); font-size: .93rem;
}
.deeper-ref a { color: var(--accent); text-underline-offset: .16em; }
.deeper-addenda { border-top: 3px solid var(--accent); margin-top: 4rem; padding-top: 2rem; }
.deeper-addenda-head { margin-bottom: 2rem; }
.deeper-addenda-list { margin: 0; padding-left: 2rem; }
.deeper-addendum { padding-left: .5rem; margin-bottom: 3rem; }
.deeper-addendum::marker { color: var(--accent); font-family: var(--f-display); font-weight: 700; }
.deeper-addendum article { display: flex; flex-direction: column; gap: .8rem; }
.deeper-addendum h2 { margin: 0; font-size: 1.35rem; }
.deeper-addendum-number { color: var(--accent); }
.deeper-back { font-family: var(--f-display); font-size: .85rem; }
@media print {
  .aggregate main { padding: 0; max-width: none; }
  .article.bundled { break-before: page; border-top: 0; margin-top: 0; padding-top: 0; }
  .agg-head { break-after: page; }
  .aggregate .xcard[open] > summary, .aggregate .xcard > summary { border-bottom: 2px solid var(--ink); }
  .deeper-addenda { break-before: page; border-top: 0; margin-top: 0; padding-top: 0; }
  .deeper-addendum h2, .deeper-addendum .crumb { break-after: avoid; }
  .deeper-back { display: none; }
}
'@

foreach ($c in $collections.Values) {
  $list = @()
  $groupNames = if ($c.Groups.Count) { $c.Groups }
                else { @($c.PageIds | ForEach-Object { $pages[$_].Section } | Select-Object -Unique) }
  foreach ($g in $groupNames) {
    $list += @($c.PageIds | ForEach-Object { $pages[$_] } | Where-Object { $_.Section -eq $g } | Sort-Object Title)
  }
  New-Aggregate ('section-' + $c.Id) $c.Title $c.Summary $list 'Section'
}
foreach ($d in ($tracks.Values | Sort-Object @{e={Get-TrackRank $_}}, Title)) {
  $list = @($d.PageIds | ForEach-Object { $pages[$_] })
  New-Aggregate ('track-' + $d.Name) $d.Title $d.Subtitle $list 'Playlist'
}
# The whole manual in one document, matching the generated 'everything'
# playlist. This is the PDF that survives the site being unreachable.
$allList = @()
foreach ($c in $collections.Values) {
  $gn = if ($c.Groups.Count) { $c.Groups }
        else { @($c.PageIds | ForEach-Object { $pages[$_].Section } | Select-Object -Unique) }
  foreach ($g in $gn) {
    $allList += @($c.PageIds | ForEach-Object { $pages[$_] } | Where-Object { $_.Section -eq $g } | Sort-Object Title)
  }
}
New-Aggregate 'track-everything' 'Everything' $site.SUMMARY $allList 'Playlist'

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

# ------------------------------------------------- link and image report -----
# Every authored container, scanned once with the SAME regex the resolver used.
# Page bodies and collection intros both carry [[tokens]], so both are scanned;
# an intro's links used to go unchecked.
$containers = @()
foreach ($p in $pages.Values) { $containers += [pscustomobject]@{ Where = $p.Id; Text = $p.Body } }
foreach ($c in $collections.Values) {
  if ($c.Intro) { $containers += [pscustomobject]@{ Where = "$($c.Id)\intro.html"; Text = $c.Intro } }
}

$dangling  = @()
$imgErrors = @()
$imgSlots  = @()
$imgUsed   = [System.Collections.Generic.HashSet[string]]::new([StringComparer]::Ordinal)
foreach ($ct in $containers) {
  # A token inside a comment is a placeholder, not content: it is not resolved
  # and it is not an error. It IS listed, so a slot waiting on artwork cannot
  # be forgotten - the reminder that failing the build was doing badly.
  foreach ($cm in [regex]::Matches($ct.Text, $script:commentRx)) {
    foreach ($tm in [regex]::Matches($cm.Value, $script:linkRx)) {
      $tid = $tm.Groups[1].Value.Trim()
      if ($tid.StartsWith($script:imgPrefix, [StringComparison]::Ordinal)) {
        $imgSlots += "$($ct.Where) -> $tid"
      }
    }
  }
  foreach ($m in [regex]::Matches(([regex]::Replace($ct.Text, $script:commentRx, '')), $script:linkRx)) {
    $id    = $m.Groups[1].Value.Trim()
    $label = if ($m.Groups[2].Success) { $m.Groups[2].Value.Trim() } else { '' }

    if (-not $id.StartsWith($script:imgPrefix, [StringComparison]::Ordinal)) {
      if (-not $pages.Contains($id)) { $dangling += "$($ct.Where) -> $id" }
      continue
    }

    # An image is different from a link in kind: a link to a page that is not
    # written yet is a normal mid-authoring state and degrades to visible
    # "pending" text. A broken image is a hole in a published page, and a
    # picture with no alt text is content that never reaches part of the
    # audience. Neither is allowed to pass as a note in the log.
    $ref = $id.Substring($script:imgPrefix.Length).Trim()
    if ($script:media.ContainsKey($ref)) {
      [void]$imgUsed.Add($ref)
      if (-not $label) { $imgErrors += "$($ct.Where): [[img:$ref]] has no alt text - use [[img:$ref|what it shows]]" }
    } else {
      $real = $null
      if ($script:mediaCi.TryGetValue($ref, [ref]$real)) {
        [void]$imgUsed.Add($real)
        $imgErrors += "$($ct.Where): [[img:$ref]] is the wrong case - the file is media\$real (GitHub Pages is case-sensitive; this would 404 live)"
      } else {
        $imgErrors += "$($ct.Where): [[img:$ref]] - no such file in media\"
      }
    }
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
if ($imgSlots.Count) {
  Write-Host ''
  Write-Host ("image placeholders in comments - not rendered, waiting on artwork ({0}):" -f $imgSlots.Count)
  $imgSlots | Sort-Object -Unique | ForEach-Object { Write-Host "  $_" }
}
$unusedMedia = @($script:media.Keys | Where-Object { -not $imgUsed.Contains($_) } | Sort-Object)
if ($unusedMedia.Count) {
  Write-Host ''
  Write-Host ("media\ files no page references ({0}): {1}" -f $unusedMedia.Count, ($unusedMedia -join ', '))
  Write-Host '  they are still copied to docs\ - remove the file if it is not wanted'
}

Write-Host ''
Write-Host ("done -> {0}" -f $docsDir)

if ($imgErrors.Count) {
  Write-Host ''
  Write-Host ("BUILD ERROR - broken image references ({0}):" -f $imgErrors.Count) -ForegroundColor Red
  $imgErrors | Sort-Object -Unique | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
  Write-Host ''
  # Every error is listed before failing, so one run shows all of them; the
  # site is still written so the broken spots can be looked at in a browser.
  exit 1
}
