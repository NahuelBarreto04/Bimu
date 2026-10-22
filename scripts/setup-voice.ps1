$ErrorActionPreference = 'Stop'
if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { throw 'Este preparador es para Windows x64.' }
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$voiceRoot = Join-Path $env:LOCALAPPDATA 'Bimu\voice'
$voiceRuntime = Join-Path $voiceRoot 'whisper-v1.9.2'
$voiceModels = Join-Path $voiceRoot 'models'
New-Item -ItemType Directory -Force -Path $voiceRoot,$voiceModels | Out-Null
$voiceArchive = Join-Path $voiceRoot 'whisper-v1.9.2.zip'
$voiceModel = Join-Path $voiceModels 'ggml-base.bin'
$voiceModelHash = '465707469ff3a37a2b9b8d8f89f2f99de7299dac'
$voiceBinaryHash = '49dcc16de826f20bd53d44f947a1ae49dfa81f86cad67a64d80820cb192d674a'
$voiceExe = Get-ChildItem -Path $voiceRuntime -Filter whisper-server.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $voiceExe) {
  Write-Host 'Descargando whisper.cpp v1.9.2 CPU x64 desde su repositorio oficial...'
  Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/ggml-org/whisper.cpp/releases/download/v1.9.2/whisper-bin-x64.zip' -OutFile $voiceArchive
  if ((Get-FileHash $voiceArchive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $voiceBinaryHash) { throw 'La descarga de Whisper no coincide con el hash publicado. No se ejecutara.' }
  Expand-Archive -Path $voiceArchive -DestinationPath $voiceRuntime -Force
  Remove-Item $voiceArchive
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
Write-Host 'Ahora ejecuta: npm run voice:start'
