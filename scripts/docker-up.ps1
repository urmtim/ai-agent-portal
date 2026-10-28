# Makes sure Docker Desktop is running before `docker compose`.
# On this Windows build Docker cannot delete its own leftover unix-socket files, so a
# restart fails with "remove ...sock: The file cannot be accessed by the system".
# Those files can't be deleted either, but their folders can be moved aside.
$ErrorActionPreference = "Stop"

function DockerUp { docker info --format "{{.ServerVersion}}" 2>$null | Out-Null; return $LASTEXITCODE -eq 0 }

if (DockerUp) { exit 0 }

if (-not (Get-Process -Name "Docker Desktop" -ErrorAction SilentlyContinue)) {
  $stamp = Get-Date -Format "yyyyMMddHHmmss"
  foreach ($dir in @("$env:LOCALAPPDATA\Docker\run", "$env:LOCALAPPDATA\docker-secrets-engine")) {
    if (-not (Test-Path $dir)) { continue }
    $stuck = Get-ChildItem $dir -Force -File | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }
    if ($stuck) {
      Rename-Item $dir "$(Split-Path $dir -Leaf).stale-$stamp"
      Write-Host "moved aside stale sockets in $dir"
    }
  }
  Write-Host "starting Docker Desktop..."
  Start-Process "C:\Program Files\Docker\Docker\Docker Desktop.exe"
}

for ($i = 0; $i -lt 90; $i++) {
  if (DockerUp) { Write-Host "Docker is up"; exit 0 }
  Start-Sleep -Seconds 2
}
Write-Error "Docker did not start in 3 minutes - open Docker Desktop and check the error"
