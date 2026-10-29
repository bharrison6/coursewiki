# Page ordering shared by every generated collection/group surface.
# Authored tracks do not call this helper: their file order remains authoritative.
function ConvertTo-PagePin($meta, [string]$source) {
  if (-not $meta.ContainsKey('PIN')) { return $false }
  $value = [string]$meta.PIN
  if ($value -ieq 'true') { return $true }
  if ($value -ieq 'false') { return $false }
  throw "$source`: @@PIN must be true or false"
}

function Sort-GroupPages($pageList) {
  @($pageList | Sort-Object `
      @{ Expression = { if ($_.Pin) { 0 } else { 1 } } }, `
      @{ Expression = { $_.Title } }, `
      @{ Expression = { $_.Id } })
}
