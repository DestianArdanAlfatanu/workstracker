# Uji WorksTracker di HP Android lewat HTTPS (Cloudflare Quick Tunnel, tanpa akun).
#   npm run tunnel            # build web, nyalakan preview :4173, lalu tunnel
#   npm run tunnel -- -NoBuild
# Syarat: API dev menyala di :4000 (npm run dev -w api) dan MySQL aktif.
# URL https://xxxx.trycloudflare.com tampil di kotak log cloudflared. Bisa diakses siapa pun yang
# tahu alamatnya selama tunnel menyala; tekan Ctrl+C untuk mematikan tunnel & preview.
param([switch]$NoBuild)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$node = 'D:\laragon\bin\nodejs\node-v22.2.0-win-x64'
if (Test-Path $node) { $env:PATH = "$node;$env:PATH" }
$cloudflared = if ($env:CLOUDFLARED) { $env:CLOUDFLARED } else { 'D:\laragon\bin\cloudflared\cloudflared.exe' }
if (-not (Test-Path $cloudflared)) { throw "cloudflared tidak ditemukan di $cloudflared (set env CLOUDFLARED)." }

Push-Location $root
try {
  if (-not $NoBuild) { npm run build -w web; if ($LASTEXITCODE) { throw 'Build web gagal' } }
  $preview = Start-Process -FilePath 'cmd.exe' -ArgumentList '/c', 'npx vite preview --port 4173 --strictPort' -WorkingDirectory (Join-Path $root 'web') -PassThru -WindowStyle Hidden
  Write-Host 'Preview build web di http://localhost:4173 (proxy /api ke :4000). Membuka tunnel...'
  # Log juga ditulis ke file agar URL tunnel bisa dibaca dari luar jendela ini.
  $log = Join-Path $env:TEMP 'workstracker-tunnel.log'
  Remove-Item $log -ErrorAction SilentlyContinue
  & $cloudflared tunnel --url http://localhost:4173 --no-autoupdate --logfile $log
} finally {
  if ($preview) { taskkill /PID $preview.Id /T /F | Out-Null }
  Pop-Location
}
