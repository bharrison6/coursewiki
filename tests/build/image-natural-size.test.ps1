$ErrorActionPreference = 'Stop'
$codeRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$tokens = $null; $errors = $null
$ast = [Management.Automation.Language.Parser]::ParseFile((Join-Path $codeRoot 'build-site.ps1'), [ref]$tokens, [ref]$errors)
foreach ($name in 'New-ImageTag', 'ConvertTo-HtmlText') {
  $function = $ast.Find({ param($node) $node -is [Management.Automation.Language.FunctionDefinitionAst] -and $node.Name -eq $name }, $true)
  Invoke-Expression $function.Extent.Text
}
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('coursewiki-image-size-' + [guid]::NewGuid().ToString('N'))
$null = New-Item -ItemType Directory $fixture
$script:media = [Collections.Generic.Dictionary[string,object]]::new()
$script:stamp = 'test'
$checks = 0
function Assert([bool]$condition, [string]$message) {
  if (-not $condition) { throw $message }
  $script:checks++; Write-Output "ok $script:checks - $message"
}
function Render([string]$svg, [string]$mode = 'site-page', [string]$mime = 'image/svg+xml') {
  $file = Join-Path $fixture 'fixture.svg'
  [IO.File]::WriteAllText($file, $svg)
  $script:media['fixture.svg'] = [pscustomobject]@{Full=$file; Rel='fixture.svg'; Mime=$mime; DataUri=$null}
  New-ImageTag 'fixture.svg' 'A & B' ([pscustomobject]@{ Up='../' }) $mode
}
foreach ($mode in 'site-page','practice-page','aggregate') {
  $html = Render '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60" viewBox="-10, 0, 960, 480"/>' $mode
  Assert ($html.Contains('data-natural-width="960" data-natural-height="480"')) "$mode uses root viewBox rather than intrinsic dimensions"
  Assert ($html.Contains('alt="A &amp; B"')) "$mode preserves escaped alt text"
  if ($mode -eq 'aggregate') { Assert ($html.Contains('src="data:image/svg+xml;base64,')) 'aggregate stays self-contained' }
}
foreach ($svg in '<svg width="120px" height="60"/>', '<svg viewBox="0 0 0 9" width="120" height="60"/>', '<svg viewBox="0 0 NaN 9" width="120" height="60"/>', '<svg width="1.25in" height="45pt"/>') {
  Assert ((Render $svg).Contains('data-natural-width="120" data-natural-height="60"')) 'valid width/height fallback in CSS pixels'
}
foreach ($svg in '<svg width="100%" height="60"/>', '<svg viewBox="0 0 -10 20"/>', '<svg><g viewBox="0 0 100 50"/></svg>') {
  Assert ((Render $svg) -notmatch 'data-natural-') 'unresolved/invalid dimensions and child viewBox are not stamped'
}
Assert ((Render '<svg viewBox="0 0 100 50"/>' 'site-page' 'image/png') -notmatch 'data-natural-') 'raster images retain intrinsic sizing'
$oldCulture = [Threading.Thread]::CurrentThread.CurrentCulture
try {
  [Threading.Thread]::CurrentThread.CurrentCulture = [Globalization.CultureInfo]::GetCultureInfo('de-DE')
  Assert ((Render '<svg viewBox="0 0 120.5 60.25"/>').Contains('data-natural-width="120.5" data-natural-height="60.25"')) 'dimensions use invariant decimals'
} finally { [Threading.Thread]::CurrentThread.CurrentCulture = $oldCulture }
Write-Output "$checks checks passed; fixture retained at $fixture"
