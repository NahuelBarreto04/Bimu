# Bimu · Próximas etapas

## En esta entrega: conversación progresiva

- [x] Respuestas de Ollama por fragmentos (streaming).
- [x] Detener la solicitud activa, incluida la espera inicial del modelo.
- [x] Conservar respuesta parcial y marcar interrupciones.
- [x] Validación de streaming y cancelación reales en Windows por el usuario.

## Primeras herramientas · implementación v0.11

- [x] Registro de herramientas con nombre, parámetros tipados, resultado y errores.
- [x] Detectar capacidad de tool calling del modelo seleccionado.
- [x] Validar las solicitudes del modelo antes de ejecutar.
- [x] Primera herramienta: lectura de archivos de una carpeta elegida por el usuario.
- [x] Limitar alcance a la carpeta autorizada; no seguir rutas fuera de ella.
- [x] Mostrar qué herramienta se está usando y devolver el resultado real al modelo.

- [x] Selector y ciclo real de lectura de TXT con Ollama validados por el usuario en Windows.
- [ ] Completar pruebas nativas de restricciones de rutas.

## Conversaciones

- [x] Markdown, tablas y bloques de código con copia (beta 0.12).
- [x] Recepción animada de una carpeta: hover, seguimiento, precarga local y confirmación (beta 0.12.1; flujo nativo validado por el usuario en Windows).
- [x] Guardar, recuperar, renombrar y borrar conversaciones localmente (beta 0.13).
- [x] Memoria explícita editable y borrable, aplicada a futuros mensajes (beta 0.13; validada por el usuario en Windows).

## Voz: hablar con Bimu

- [x] Elegir micrófono y mostrar si está grabando (beta 0.14).
- [x] Pulsar para hablar y convertir audio a texto con whisper.cpp local (beta 0.14).
- [x] Revisar/enviar la transcripción como un mensaje normal (beta 0.14).
- [x] Captura, micrófono y transcripción real validados por el usuario en Windows tras corregir segmentación.
- [ ] Evaluar reconocimiento local y su consumo de recursos en Windows.
- [ ] Respuesta hablada opcional con controles de voz y volumen (pospuesta por el usuario).
- [x] Activación experimental por “Bimu”, opcional, con VAD + Whisper local (beta 0.16).
- [x] Instrumentación local de latencia, conteos y reportes manuales; espera de silencio configurable y persistente.
- [ ] Medir precisión, latencia y consumo del modo manos libres en Windows con el diagnóstico (CPU/RAM desde Administrador de tareas).
- [ ] Evaluar detector dedicado de palabra clave para reducir CPU y pausas.

El primer paso será pulsar para hablar. La escucha continua no estará activada por defecto.

## Acciones en la PC, por texto o voz

- [x] Texto y transcripción revisada comparten el motor nativo de aperturas.
- [x] Abrir aplicaciones registradas, por ejemplo “Bimu, abrí Spotify” (beta 0.15).
- [x] Resolver nombre/alias contra una lista permitida con destino fijo y selección nativa de ejecutable.
- [x] Distinguir apertura de reproducción o control de cuentas.
- [x] Informar aplicación no instalada, destino inválido y apertura fallida.
- [x] Confirmación y permiso recordable por aplicación, revocable en Ajustes.
- [x] Las aperturas no convierten texto del modelo en comandos de terminal.
- [ ] Más adelante: crear/editar archivos y comandos con revisión adecuada a la acción.

## Integraciones

- [ ] GitHub, Vercel y n8n con estados y datos reales.

## Escritorio

- [x] Click-through de márgenes mediante regiones y seguimiento nativo del cursor (0.17; validación manual Windows pendiente).
- [ ] Selector de monitor y pruebas con distintos DPI.
- [x] Pipeline Windows para pruebas nativas e instalador NSIS (0.17).
- [x] Gestión de Whisper CPU/GPU desde Ajustes, inicio automático opcional y cierre de procesos propios (0.17).
- [x] Buscar/descargar releases estables y lanzar instalador verificado desde la app (0.17).
- [ ] Validar instalación/actualización real y clics en márgenes en Windows.


## Documentos múltiples · beta 0.15

- [x] Selector múltiple y drag and drop de hasta 10 archivos sueltos.
- [x] TXT, PDF con texto, DOCX, XLS/XLSX/ODS y texto compatible.
- [x] Precarga local, estado por archivo, extractos parciales y permisos limitados a los adjuntos.
- [x] Agregar lotes y quitar archivos individuales.
- [x] Apertura nativa y comparación de PDF propios validadas por el usuario en Windows (beta 0.15).
- [ ] Validar contexto automático de adjuntos y nombres originales en Windows (beta 0.16).
- [ ] OCR de PDF escaneado e imágenes.
- [ ] Paginación/búsqueda para documentos y planillas grandes.


## Etapas acordadas · v0.18

- [x] Etapa 1: submenús, preferencia de escucha, transparencia, descanso tras 10 minutos y versión en Actualizaciones.
- [x] Etapa 2: atajos rápidos con varias apps, páginas y carpetas; búsqueda nativa de carpetas por nombre.
- [ ] Etapa 3: actualización y reinicio desde Bimu sin recorrer el asistente de instalación.

## Escucha y autonomía · v0.20

- [x] Medidor de micrófono, calibración de ruido, sensibilidad ampliada y amplificación limitada para voz baja.
- [x] Pestaña lateral compacta con chat rápido que se despliega hacia adentro.
- [ ] Pedidos generales por voz conectados a Ollama y herramientas generales; descubrimiento de aplicaciones instaladas y consultas de hora.
