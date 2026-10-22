param([ValidateSet('cpu','gpu')][string]$Mode = 'cpu')
$ErrorActionPreference = 'Stop'
$voiceRoot = Join-Path $env:LOCALAPPDATA 'Bimu\voice'
$voiceRuntimeName = if ($Mode -eq 'gpu') { 'whisper-v1.9.2-cuda-12.4' } else { 'whisper-v1.9.2' }
$voiceRuntime = Join-Path $voiceRoot $voiceRuntimeName
$voiceModel = Join-Path $voiceRoot 'models\ggml-base.bin'
$voiceExe = Get-ChildItem -Path $voiceRuntime -Filter whisper-server.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $voiceExe -or -not (Test-Path $voiceModel)) { throw "Primero ejecuta npm run voice:setup (CPU) o npm run voice:setup:gpu (GPU). Modo solicitado: $Mode." }
if ((Get-FileHash $voiceModel -Algorithm SHA1).Hash.ToLowerInvariant() -ne '465707469ff3a37a2b9b8d8f89f2f99de7299dac') { throw 'El modelo cambio. Volve a ejecutar npm run voice:setup.' }
Write-Host 'Iniciando Whisper para Bimu en 127.0.0.1:8081. Espera la carga del modelo y comproba el motor desde Ajustes. Deja esta terminal abierta; Ctrl+C para detener.'
$voiceArgs = @('-m', $voiceModel, '--host', '127.0.0.1', '--port', '8081', '-l', 'es', '-t', '4')
if ($Mode -eq 'cpu') {
  $voiceArgs += '-ng'
  Write-Host 'Modo solicitado: CPU (GPU desactivada).'
} else {
  if (-not (Test-Path (Join-Path $voiceExe.DirectoryName 'ggml-cuda.dll'))) { throw 'Falta ggml-cuda.dll. Volve a preparar el motor GPU.' }
  Write-Host 'Modo solicitado: NVIDIA CUDA. Confirma en los logs ggml_cuda y el nombre de tu GPU. Si indica CPU o no hay dispositivo CUDA, la aceleracion no esta confirmada.'
  Write-Host 'Si falla por driver/DLL o memoria, detene este motor y usa npm run voice:start para volver a CPU. No se cambia de modo silenciosamente.'
}
Push-Location $voiceExe.DirectoryName
try {
  & $voiceExe.FullName @voiceArgs
  $voiceExitCode = $LASTEXITCODE
} finally { Pop-Location }

if ($voiceExitCode -ne 0) { throw "Whisper finalizo con codigo $voiceExitCode. Revisa la salida anterior (incluido si el puerto 8081 esta ocupado)." }
