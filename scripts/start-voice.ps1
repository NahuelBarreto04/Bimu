$ErrorActionPreference = 'Stop'
$voiceRoot = Join-Path $env:LOCALAPPDATA 'Bimu\voice'
$voiceRuntime = Join-Path $voiceRoot 'whisper-v1.9.2'
$voiceModel = Join-Path $voiceRoot 'models\ggml-base.bin'
$voiceExe = Get-ChildItem -Path $voiceRuntime -Filter whisper-server.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $voiceExe -or -not (Test-Path $voiceModel)) { throw 'Primero ejecuta npm run voice:setup.' }
if ((Get-FileHash $voiceModel -Algorithm SHA1).Hash.ToLowerInvariant() -ne '465707469ff3a37a2b9b8d8f89f2f99de7299dac') { throw 'El modelo cambio. Volve a ejecutar npm run voice:setup.' }
Write-Host 'Iniciando Whisper para Bimu en 127.0.0.1:8081. Espera la carga del modelo y comproba el motor desde Ajustes. Deja esta terminal abierta; Ctrl+C para detener.'
& $voiceExe.FullName -m $voiceModel --host 127.0.0.1 --port 8081 -l es -ng -t 4
if ($LASTEXITCODE -ne 0) { throw "Whisper finalizo con codigo $LASTEXITCODE. Revisa la salida anterior (incluido si el puerto 8081 esta ocupado)." }
