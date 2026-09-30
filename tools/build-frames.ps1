# build-frames.ps1
# Chuyen chuoi anh PNG (Sequence1\Sequence1_000.png ... Sequence1_249.png)
# thanh WebP nhieu kich thuoc: frames\1920, frames\1280, frames\960
# Yeu cau: ffmpeg co trong PATH (kiem tra bang: ffmpeg -version)
#
# Cach dung:  powershell -ExecutionPolicy Bypass -File tools\build-frames.ps1

$ErrorActionPreference = "Stop"

$root    = Split-Path -Parent $PSScriptRoot
$srcDir  = Join-Path $root "Sequence1"
$pattern = Join-Path $srcDir "Sequence1_%03d.png"
$start   = 0
$count   = 250
$quality = 78
$widths  = @(1920, 1280, 960)

if (-not (Get-Command ffmpeg -ErrorAction SilentlyContinue)) {
    throw "Khong tim thay ffmpeg trong PATH. Cai ffmpeg roi chay lai."
}

foreach ($w in $widths) {
    $outDir = Join-Path $root "frames\$w"
    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    Write-Host "==> Dang tao frames\$w\frame_000.webp ... frame_$('{0:D3}' -f ($count-1)).webp"
    & ffmpeg -y -hide_banner -loglevel error `
        -start_number $start -i $pattern `
        -vf "scale=${w}:-2" `
        -c:v libwebp -quality $quality -compression_level 6 `
        -start_number $start `
        (Join-Path $outDir "frame_%03d.webp")
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg loi o kich thuoc $w" }
}

Write-Host "Xong. Kiem tra thu muc frames\."
