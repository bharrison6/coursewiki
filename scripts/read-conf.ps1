# Shared @@FIELD header reader for site configuration and topic asset manifests.
function Read-Conf([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) { throw "missing conf: $path" }
  $raw = [IO.File]::ReadAllText($path)
  $split = $raw -split '(?m)^@@END\s*$', 2
  if ($split.Count -ne 2) { throw "$path : no @@END line closing the header" }
  $meta = @{}
  foreach ($line in ($split[0] -split "`r?`n")) {
    if ($line -match '^@@([A-Z]+):\s*(.*)$') { $meta[$Matches[1]] = $Matches[2].Trim() }
  }
  [pscustomobject]@{ Meta = $meta; Body = $split[1] }
}
