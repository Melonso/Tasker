[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [string]$ProtectedKeyPath,

  [Parameter(Mandatory = $true)]
  [string]$DestinationPath
)

$ErrorActionPreference = "Stop"

$protectedPath = (Resolve-Path -LiteralPath $ProtectedKeyPath).Path
$destinationFullPath = [System.IO.Path]::GetFullPath($DestinationPath)
$destinationDirectory = [System.IO.Path]::GetDirectoryName($destinationFullPath)

if (-not $destinationDirectory) {
  throw "DestinationPath must include a directory."
}

if (-not (Test-Path -LiteralPath $destinationDirectory -PathType Container)) {
  New-Item -ItemType Directory -Path $destinationDirectory | Out-Null
}

$protectedBytes = [System.IO.File]::ReadAllBytes($protectedPath)
$plainBytes = [System.Security.Cryptography.ProtectedData]::Unprotect(
  $protectedBytes,
  $null,
  [System.Security.Cryptography.DataProtectionScope]::CurrentUser
)

try {
  [System.IO.File]::WriteAllBytes($destinationFullPath, $plainBytes)
  & icacls.exe $destinationFullPath /inheritance:r /grant:r "$($env:USERNAME):(R,W)" | Out-Null
  Write-Host "Klucz odzyskano do: $destinationFullPath"
  Write-Warning "Plik zawiera jawny klucz. Przenieś go bezpiecznie na serwer odzyskiwania i usuń lokalną kopię po użyciu."
}
finally {
  [System.Security.Cryptography.CryptographicOperations]::ZeroMemory($plainBytes)
}
