$ErrorActionPreference = "Stop"

$Root = $PSScriptRoot
$BuildDir = Join-Path $Root "build"
$StageDir = Join-Path $BuildDir "stage"
$DistDir = Join-Path $Root "dist"
$ZipPath = Join-Path $BuildDir "payload.zip"
$IcoPath = Join-Path $BuildDir "tanques.ico"
$CsPath = Join-Path $BuildDir "Launcher.cs"
$ExePath = Join-Path $DistDir "TanquesTacticos2D.exe"

$Csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $Csc)) {
  throw "No se encontro csc.exe en $Csc"
}

$NodePath = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path $NodePath)) {
  throw "No se encontro node.exe"
}

New-Item -ItemType Directory -Force -Path $BuildDir, $DistDir | Out-Null
if (Test-Path $StageDir) { Remove-Item -Recurse -Force $StageDir }
if (Test-Path $ZipPath) { Remove-Item -Force $ZipPath }
New-Item -ItemType Directory -Force -Path $StageDir | Out-Null

# 1. Generar icono .ico de tanque Pixel Art (32x32 PNG embebido en formato ICO)
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap 32, 32
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(15, 23, 42))
$fill = {
  param($r, $gCol, $b, $x, $y, $w, $h)
  $br = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb($r, $gCol, $b))
  $g.FillRectangle($br, $x, $y, $w, $h)
  $br.Dispose()
}
& $fill 30 41 59 4 6 24 4
& $fill 30 41 59 4 22 24 4
& $fill 136 19 55 6 9 18 14
& $fill 225 29 72 9 11 10 10
& $fill 56 189 248 17 14 12 4
& $fill 2 132 199 27 13 3 6
$g.Dispose()

$pngStream = New-Object System.IO.MemoryStream
$bmp.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $pngStream.ToArray()
$pngStream.Dispose()
$bmp.Dispose()

$icoStream = [System.IO.File]::Create($IcoPath)
$bw = New-Object System.IO.BinaryWriter $icoStream
$bw.Write([UInt16]0) # reserved
$bw.Write([UInt16]1) # type: icon
$bw.Write([UInt16]1) # image count
$bw.Write([Byte]32)  # width
$bw.Write([Byte]32)  # height
$bw.Write([Byte]0)   # colors
$bw.Write([Byte]0)   # reserved
$bw.Write([UInt16]1) # planes
$bw.Write([UInt16]32) # bpp
$bw.Write([UInt32]$pngBytes.Length)
$bw.Write([UInt32]22) # offset
$bw.Write($pngBytes)
$bw.Dispose()
$icoStream.Dispose()

# 2. Preparar payload autocontenido (node.exe + servidor + public)
Copy-Item $NodePath (Join-Path $StageDir "node.exe")
Copy-Item (Join-Path $Root "server.js") (Join-Path $StageDir "server.js")
Copy-Item (Join-Path $Root "package.json") (Join-Path $StageDir "package.json")
Copy-Item -Recurse (Join-Path $Root "src") (Join-Path $StageDir "src")
Copy-Item -Recurse (Join-Path $Root "public") (Join-Path $StageDir "public")

Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory($StageDir, $ZipPath, [System.IO.Compression.CompressionLevel]::Optimal, $false)

# 3. Compilar ejecutable Windows GUI (/target:winexe) sin consola visible
& $Csc `
  /nologo `
  /optimize+ `
  /platform:x64 `
  /target:winexe `
  "/win32icon:$IcoPath" `
  "/out:$ExePath" `
  "/resource:$ZipPath,Tanques.payload.zip" `
  /r:System.Windows.Forms.dll `
  /r:System.IO.Compression.dll `
  /r:System.IO.Compression.FileSystem.dll `
  $CsPath

if ($LASTEXITCODE -ne 0) {
  throw "Fallo al compilar $ExePath"
}

Remove-Item -Recurse -Force $StageDir

$mb = [Math]::Round((Get-Item $ExePath).Length / 1MB, 2)
Write-Output ("EXE_BUILT_OK=" + $ExePath + " SIZE_MB=" + $mb)
