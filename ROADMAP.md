# Bimu · Próximas etapas

## En esta entrega: conversación progresiva

- [x] Respuestas de Ollama por fragmentos (streaming).
- [x] Detener la solicitud activa, incluida la espera inicial del modelo.
- [x] Conservar respuesta parcial y marcar interrupciones.
- [ ] Validación de streaming y cancelación reales en Windows.

## Próxima etapa: primeras herramientas

- [ ] Registro de herramientas con nombre, parámetros tipados, resultado y errores.
- [ ] Detectar capacidad de tool calling del modelo seleccionado.
- [ ] Validar las solicitudes del modelo antes de ejecutar.
- [ ] Primera herramienta: lectura de archivos de una carpeta elegida por el usuario.
- [ ] Limitar alcance a la carpeta autorizada; no seguir rutas fuera de ella.
- [ ] Mostrar qué herramienta se está usando y devolver el resultado real al modelo.

## Conversaciones

- [ ] Markdown y bloques de código.
- [ ] Guardar y recuperar conversaciones.
- [ ] Preferencias/memoria que el usuario pueda revisar y borrar.

## Voz: hablar con Bimu

- [ ] Elegir micrófono y mostrar si está grabando.
- [ ] Pulsar para hablar y convertir audio a texto.
- [ ] Revisar/enviar la transcripción como un mensaje normal.
- [ ] Evaluar reconocimiento local y su consumo de recursos en Windows.
- [ ] Respuesta hablada opcional con controles de voz y volumen.
- [ ] Más adelante: activación por palabra clave “Bimu”, opcional.

El primer paso será pulsar para hablar. La escucha continua no estará activada por defecto.

## Acciones en la PC, por texto o voz

- [ ] Compartir el mismo motor de herramientas para ambas formas de entrada.
- [ ] Primera acción: abrir aplicaciones registradas, por ejemplo “Bimu, abrí Spotify”.
- [ ] Resolver nombre/alias contra una lista de aplicaciones permitidas, con destino fijo y configurable.
- [ ] Distinguir abrir una aplicación de otras acciones como reproducir contenido o controlar la cuenta.
- [ ] Manejar aplicación no instalada, destino inválido y apertura fallida.
- [ ] Permisos por acción; permitir recordar autorización para aperturas simples.
- [ ] No convertir directamente texto del modelo en comandos de terminal.
- [ ] Más adelante: crear/editar archivos y comandos con revisión adecuada a la acción.

## Integraciones

- [ ] GitHub, Vercel y n8n con estados y datos reales.

## Escritorio

- [ ] Click-through en márgenes transparentes.
- [ ] Selector de monitor y pruebas con distintos DPI.
- [ ] Instalador de Windows y verificaciones nativas automatizadas.
