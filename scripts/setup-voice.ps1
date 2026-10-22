param([ValidateSet('cpu','gpu')][string]$Mode = 'cpu')
$ErrorActionPreference = 'Stop'
if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { throw 'Este preparador es para Windows x64.' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$voiceRoot = Join-Path $env:LOCALAPPDATA 'Bimu\voice'
$voiceRuntimeName = if ($Mode -eq 'gpu') { 'whisper-v1.9.2-cuda-12.4' } else { 'whisper-v1.9.2' }
$voiceRuntime = Join-Path $voiceRoot $voiceRuntimeName
$voiceModels = Join-Path $voiceRoot 'models'
New-Item -ItemType Directory -Force -Path $voiceRoot,$voiceModels | Out-Null
$voiceArchive = Join-Path $voiceRoot "$voiceRuntimeName.zip"
$voiceModel = Join-Path $voiceModels 'ggml-base.bin'
$voiceModelHash = '465707469ff3a37a2b9b8d8f89f2f99de7299dac'
$voiceBinaryHash = if ($Mode -eq 'gpu') { '443110ddaad70d4290ab2e77179e31cf712035bbc4fad56bb4519a90c917b39c' } else { '49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a' }
$voiceAsset = if ($Mode -eq 'gpu') { 'whisper-cublas-12.4.0-bin-x64.zip' } else { 'whisper-bin-x64.zip' }
$voiceExe = Get-ChildItem -Path $voiceRuntime -Filter whisper-server.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $voiceExe) {
  Write-Host "Descargando whisper.cpp v1.9.2 ($Mode) desde su repositorio oficial..."
  $voiceStage = Join-Path $voiceRoot ("staging-" + [Guid]::NewGuid().ToString('N'))
  try {
    Invoke-WebRequest -UseBasicParsing -Uri "https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/$voiceAsset" -OutFile $voiceArchive
    if ((Get-FileHash $voiceArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $voiceBinaryHash) { throw 'La descarga de Whisper no coincide con el hash publicado. No se ejecutara.' }
    Expand-Archive -Path $voiceArchive -DestinationPath $voiceStage -Force
    if (-not (Get-ChildItem -Path $voiceStage -Filter whisper-server.exe -Recurse | Select-Object -First 1)) { throw 'La descarga no contiene whisper-server.exe.' }
    if ($Mode -eq 'gpu' -and -not (Get-ChildItem -Path $voiceStage -Filter ggml-cuda.dll -Recurse | Select-Object -First 1)) { throw 'La descarga no contiene el backend CUDA.' }
    if (Test-Path $voiceRuntime) { Remove-Item -Recurse -Force $voiceRuntime }
    Move-Item -Path $voiceStage -Destination $voiceRuntime
  } finally {
    if (Test-Path $voiceStage) { Remove-Item -Recurse -Force $voiceStage }
    if (Test-Path $voiceArchive) { Remove-Item -Force $voiceArchive }
  }
}
$voiceModelValid = (Test-Path $voiceModel) -and ((Get-FileHash $voiceModel -Algorithm SHA1).Hash.ToLowerInvariant() -eq $voiceModelHash)
if (-not $voiceModelValid) {
  Write-Host 'Descargando el modelo base multilingue (~142 MiB). Solo es necesario una vez...'
  $voicePartial = "$voiceModel.partial"
  try {
    Invoke-WebRequest -UseBasicParsing -Uri 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin' -OutFile $voicePartial
    if ((Get-FileHash $voicePartial -Algorithm SHA1).Hash.ToLowerInvariant() -ne $voiceModelHash) { throw 'El modelo descargado no coincide con el hash oficial.' }
    Move-Item -Path $voicePartial -Destination $voiceModel -Force
  } finally { if (Test-Path $voicePartial) { Remove-Item $voicePartial } }
}
$voiceExe = Get-ChildItem -Path $voiceRuntime -Filter whisper-server.exe -Recurse | Select-Object -First 1
if (-not $voiceExe) { throw 'No se encontro whisper-server.exe en la descarga.' }
Write-Host "Motor preparado en $voiceRoot"
if ($Mode -eq 'gpu') { Write-Host 'Ahora ejecuta: npm run voice:start:gpu. Requiere una GPU NVIDIA y un driver compatible con CUDA 12.4. Las DLL CUDA vienen incluidas en la descarga oficial.' } else { Write-Host 'Ahora ejecuta: npm run voice:start' }
