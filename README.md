# Bimu · Beta v0.19.0

Tauri 2 + React + Three.js para Windows. Conserva temas claro/oscuro/sistema, cuatro tintes, avatar personalizable y menú Inicio/Chat/Conexiones/Ajustes.

## Ejecutar en Windows

Requisitos (si ya ejecutaste la v0.6, no hace falta reinstalarlos): Node.js LTS, Rust con toolchain MSVC, Microsoft C++ Build Tools con Desarrollo para el escritorio con C++ y Windows SDK, y WebView2 Runtime.

- https://nodejs.org/
- https://rustup.rs/
- https://visualstudio.microsoft.com/visual-cpp-build-tools/
- https://developer.microsoft.com/microsoft-edge/webview2/
- Guía: https://v2.tauri.app/start/prerequisites/

Cerrá la versión anterior desde la bandeja. Descomprimí esta versión y abrí PowerShell en la carpeta que contiene package.json:

```powershell
npm ci
npm run desktop:dev
```

Tauri inicia Vite automáticamente en el puerto 5173; no ejecutes otra copia de `npm run dev` al mismo tiempo. La primera compilación Rust puede demorar varios minutos.

## Notch: tres estados

- **Reposo:** notch pequeño siempre visible, con avatar y colores del tema seleccionado.
- **Hover:** se amplía a un tamaño intermedio y muestra una invitación a abrirlo. Al salir vuelve al estado pequeño tras 340 ms si no hay un campo enfocado.
- **Clic:** abre el menú. El botón ↙ vuelve al notch pequeño. Inicio también se cierra tras 20 segundos sin interacción; las demás pestañas permanecen abiertas.

El avatar del modo compacto forma parte del notch, y el clic y arrastre se manejan desde su superficie completa. No se expande al terminar un arrastre.

## Ubicación y movimiento

En **Ajustes → En tu escritorio → Borde del monitor** elegí Arriba, Abajo, Izquierda o Derecha.

- Arriba/abajo: arrastrá horizontalmente.
- Izquierda/derecha: arrastrá verticalmente.
- Con el menú abierto, usá el icono de puntos de la barra para arrastrar sobre el mismo eje.
- El notch se imanta al centro cuando su punto de anclaje queda a menos de 24 píxeles lógicos del centro del borde. Durante el arrastre se resalta al quedar centrado.
- El botón **Centrar en el borde** coloca el anclaje exactamente al medio. También está en el menú de la bandeja.
- Cada borde recuerda su propia posición. El borde seleccionado, tamaño y preferencias se conservan al cerrar.

Se usa el **área útil del monitor**, respetando la barra de tareas. La ventana se mantiene dentro de sus límites al ampliar. El movimiento ya no es libre por el escritorio. El monitor se obtiene desde la ubicación actual de la ventana; esta versión no incluye selector de monitor.

Los laterales tienen un notch vertical y una barra de navegación vertical en el menú, con tarjetas reordenadas en una columna.

## Tema, avatar y bandeja

En Ajustes podés cambiar Claro/Oscuro/Sistema y el tinte Lavanda/Océano/Salvia/Durazno, tamaño del notch, siempre visible, color del cuerpo y accesorios.

Saludar y Descansar están en Inicio. Ocultar está en la barra del menú. Para recuperar el notch, usá Mostrar mascota desde la bandeja de Windows (quizás dentro de la flecha de iconos ocultos). Alt+F4 oculta; **Cerrar aplicación** termina el proceso.

El material usa transparencias, gradientes, reflejos y backdrop-filter CSS. El desenfoque del escritorio real depende de Windows/WebView2; no implementa refracción óptica nativa.

## Chat con Ollama

1. Instalá y abrí Ollama para Windows desde https://ollama.com/download/windows . Si ya lo tenés, no hace falta reinstalarlo.
2. Asegurate de tener al menos un modelo descargado en Ollama. Podés comprobarlo con `ollama list` en PowerShell.
3. Abrí Bimu y entrá en **Conexiones → Ollama → Detectar modelos**. Bimu también intenta detectar al arrancar.
4. Elegí un modelo instalado y abrí Chat. También podés enviar desde el input rápido del notch.

La conexión sale de Tauri hacia `http://127.0.0.1:11434`, sin proxy del sistema ni cambios de CORS. Ollama debe estar funcionando en esa dirección. La vista del navegador no conecta con Ollama: usá `npm run desktop:dev`.

- Enter envía; Shift+Enter agrega una línea.
- El historial se conserva mientras Bimu esté abierto y puede borrarse con Nueva conversación. Se envían como contexto hasta los últimos 40 mensajes.
- El borrador y el modelo elegido se guardan localmente. Los mensajes de la sesión no se guardan en disco por Bimu.
- Presenta la respuesta por fragmentos mientras el modelo genera. El botón Detener cancela la solicitud activa y conserva el texto parcial.
- Si falla, mantiene el borrador para reintentar. Detecta servidor inaccesible, lista vacía, errores del modelo y respuesta vacía. Tiempo límite de respuesta: 180 segundos; la primera carga del modelo puede demorar.
- Sin carpeta compartida, el modelo solo conversa. Con una carpeta compartida y un modelo compatible puede listar y leer texto mediante herramientas. No escribe, no abre aplicaciones ni ejecuta comandos. GitHub, Vercel y n8n siguen pendientes.
- Bimu se comunica con el servidor Ollama de tu PC. Si elegís un modelo remoto configurado en Ollama, su ejecución depende de la configuración de ese servidor.

## Vista web

```powershell
npm run dev
```

http://127.0.0.1:5173 conserva el editor original. http://127.0.0.1:5173/?desktop=1 abre la vista previa del panel. El movimiento de la ventana y la bandeja solo actúan en Tauri.

## Verificación

```powershell
npm test
npm run build
```

- Compilación web de producción verificada.
- Pruebas geométricas incluidas: 540 combinaciones de bordes, estados, posiciones, DPI y orígenes de monitor; centrado y magnetismo.
- Pruebas temporales de interacción DOM: reposo/hover/clic, navegación, cuatro bordes, centrado persistente, temas, tintes y borrador.
- La validación visual, arrastre nativo, cambios de DPI y bandeja en Windows quedan pendientes. El entorno de preparación no tiene toolchain Rust ni Windows.

Primera prueba recomendada: elegir cada borde, arrastrar sobre su eje, acercarlo al centro, expandir/cerrar en una posición próxima a la esquina, cambiar tema y reiniciar para verificar persistencia.

## Instalador

En Windows:

```powershell
npm run desktop:build
```

Se genera en `src-tauri/target/release/bundle/nsis/`. Este ZIP contiene código fuente; no incluye .exe precompilado.

Organización visual inspirada en https://github.com/Louis-CFM/coucou . Implementación independiente, sin código, personaje ni assets de Coucou.


## Desarrollo con Git

Repositorio: https://github.com/marianoarias1/Bimu . Por ahora trabajamos directamente sobre `main`.

Primera vez:

```powershell
git clone https://github.com/marianoarias1/Bimu.git
cd Bimu
npm ci
npm run desktop:dev
```

Para actualizar una copia existente, cerrá Bimu desde la bandeja y detené la ejecución anterior con Ctrl+C. Después:

```powershell
git pull --ff-only origin main
npm ci
npm run desktop:dev
```

Si Git detecta cambios locales que impiden actualizar, revisalos antes de continuar. El código vive en la raíz del repositorio; no necesitás descargar ZIPs.


## Cambios de la beta v0.8

- Barra más larga: tamaño M horizontal 330×54 en reposo y 410×86 en hover. Los bordes laterales usan 116×206 y 156×260 para mantener el input usable.
- Input rápido en el notch: comparte el borrador con Chat y lo guarda localmente. Enter o el icono de enviar abren Chat con el texto escrito. El envío real permanece deshabilitado hasta conectar Ollama.
- Hover unificado sobre toda la superficie, incluido avatar e input. El canvas no captura eventos en reposo. Escribir mantiene la barra abierta y pasar entre avatar/campo no la contrae.
- Apertura parcial 260 ms; apertura completa 190 ms; cierre 230 ms, con curva de desaceleración. Se respeta Reducir movimiento.
- En Tauri se anima la superficie dentro de una ventana transparente temporal y se ajusta la ventana al finalizar. Evita redimensionar la ventana nativa en cada fotograma. El anclaje y el movimiento restringido se conservan.

Verificaciones de esta entrega: `npm test`, `npm run build` y pruebas DOM de hover compartido, transferencia del borrador a Chat y regresión de navegación/tema. La fluidez y el hover nativos quedan pendientes de comprobar en Windows.


## Cambios de la beta v0.9

- Avatar con viewport WebGL fijo durante reposo/hover: evita recortes y deformaciones por redimensionamientos durante la transición. Se conserva la zona unificada de hover.
- Chat real con Ollama mediante comandos Tauri asíncronos y HTTP local desde Rust. No requiere API key para el servidor local predeterminado.
- Selector de modelo, estado de conexión, conversación contextual, borrador compartido, Nueva conversación y estado Pensando.
- Pruebas: geometría y duraciones, validación del cliente, modelos, contexto, respuestas inválidas, bloqueo de duplicados, recuperación de errores y regresión de UI.
- Compilación web verificada. La compilación Rust, conexión real con Ollama y revisión visual del hover deben comprobarse en Windows.

Para actualizar: cerrar Bimu desde bandeja, detener la ejecución anterior, `git pull --ff-only origin main`, `npm ci` y `npm run desktop:dev`. La nueva dependencia HTTP de Rust se descarga durante la primera compilación.


## Ajuste v0.9.1 · Hover del avatar

Reposo y hover ahora comparten un marco nativo fijo: la ventana no cambia de posición/tamaño al entrar o salir del hover. Solo se anima la superficie visible dentro del marco. Esto elimina los ajustes nativos que se realizaban al inicio y final de la transición. Al abrir el menú sigue ampliándose el marco.

También se elimina una transición secundaria sobre la posición del avatar y se calcula la mirada sobre su viewport, con límites y suavizado; ya no depende del tamaño de la ventana transparente.

Se reserva un pequeño margen transparente alrededor del notch de reposo para alojar el hover. Ese margen forma parte de la ventana; el paso de clics a través de zonas transparentes sigue pendiente.

Pruebas: geometría del marco para cuatro bordes, distintas escalas y posiciones; mirada limitada; ocho entradas/salidas de hover con API nativa simulada, sin llamadas a mover/redimensionar. Compilación web verificada. La revisión visual definitiva en Windows queda pendiente. Ollama mantiene el comportamiento de v0.9.


## v0.10 · Streaming y próximos pasos

Ollama ahora responde con `stream: true`. Rust procesa NDJSON, recompone fragmentos UTF-8 y envía texto al frontend mediante un canal Tauri. La UI agrupa actualizaciones cada 32 ms para evitar un render por token.

Detener cierra la solicitud activa, incluso durante la carga inicial del modelo, y muestra la respuesta parcial como interrumpida. Un identificador por solicitud evita mezclar respuestas y permite cancelar aunque el clic llegue antes del inicio del trabajo nativo. La cancelación queda confirmada cuando la solicitud termina; el botón muestra Deteniendo mientras tanto. Si falla la red después de recibir texto, se conserva lo leído.

El streaming mejora el tiempo hasta poder empezar a leer; no aumenta por sí solo la velocidad del modelo. La carga inicial y el razonamiento previo pueden seguir demorando.

Pendientes y orden de implementación en [ROADMAP.md](ROADMAP.md), incluyendo micrófono, respuesta hablada y apertura de aplicaciones como Spotify, tanto por voz como por texto. Estas funciones siguen pendientes; esta entrega no activa escucha ni ejecución de acciones.

Verificación: pruebas JS del cliente, streaming, cancelación, fragmentos y estados del chat, más compilación web. Se incluyen pruebas Rust de paquetes NDJSON y UTF-8; no se ejecutaron en el entorno de preparación porque no dispone de Rust. La cancelación y el streaming reales deben validarse en Windows. Podés ejecutar `cargo test --manifest-path src-tauri/Cargo.toml` en Windows para las pruebas nativas.


## v0.11 · Primera herramienta: consultar un proyecto

1. En Chat, elegí **Compartir carpeta** y seleccioná el proyecto en el diálogo de Windows.
2. Elegí un modelo que informe soporte de herramientas (`tools` en `/api/show`). Si no lo admite o la comprobación falla, Bimu lo indica y no permite consultas con archivos. Podés quitar la carpeta para seguir conversando normalmente.
3. Preguntá, por ejemplo: **“Leé el README y package.json y explicame qué hace este proyecto”** o **“Buscá en src qué componente renderiza la pantalla inicial”**.
4. En **Consultas de archivos** se muestran las rutas y el estado real de cada lectura/listado.
5. Para terminar, usá **Quitar**. Primero detené cualquier respuesta en curso. Quitar o cambiar la carpeta limpia la conversación; no borra archivos.

La carpeta se autoriza solo por el selector nativo y durante la sesión actual. No se restaura al reiniciar. La selección permite enviar al modelo elegido los archivos consultados por las herramientas; si ese modelo usa un servicio remoto a través de Ollama, se aplica su configuración.

### Alcance

- Herramientas permitidas: `list_files` y `read_file`, con argumentos validados. El motor puede encadenar varias consultas y conserva streaming/cancelación.
- Rutas relativas con `/`; se rechazan rutas absolutas, `..`, rutas fuera de la carpeta, enlaces simbólicos y parámetros desconocidos. Se comprueba la autorización antes y después de leer.
- Se omiten archivos/carpetas ocultos, dependencias, salidas de compilación y nombres/extensiones sensibles conocidos (por ejemplo `.env`, `.git`, `node_modules`, claves `.key`/`.pem`). Este filtro no detecta todo secreto que pueda aparecer dentro de un archivo común.
- Texto UTF-8 hasta 64 KiB por archivo. No admite binarios, PDF ni documentos de Office.
- Listados de un nivel, hasta 120 entradas visibles (inspeccionando un máximo de 2000). Puede recorrer subcarpetas con nuevas llamadas.
- Hasta 8 llamadas y 5 rondas por mensaje; máximo 96 KiB de contenido de archivos enviado al modelo por mensaje. Si se llega al límite, hacé una pregunta más específica.
- No se agrega todo el proyecto al contexto: el modelo decide qué consultar. La respuesta depende de su capacidad para usar herramientas y citar las rutas que leyó.

### Verificación

Pruebas JS del cliente y del estado de conversación: autorización explícita, eventos de herramientas, rechazo de modelo incompatible, revocación, chat sin archivos y regresión de streaming. Compilación web verificada.

Se agregaron pruebas Rust de rutas, parámetros, texto pequeño y rechazo de binarios/archivos grandes. La compilación y las pruebas Rust y el ciclo real de herramientas deben ejecutarse en Windows, porque el entorno de preparación no tiene Rust. Usá `cargo test --manifest-path src-tauri/Cargo.toml`.

La primera compilación descarga `tauri-plugin-dialog`. No necesitás reinstalar los requisitos de Windows.


## Beta 0.12: recibir carpetas y respuestas con formato

Arrastrá una carpeta sobre el notch: se abre a tamaño medio, oculta el input y Bimu extiende los brazos siguiendo el arrastre. Al salir vuelve a reposo; al soltar prepara un listado local acotado y pregunta qué querés hacer. **Usar en el chat** comparte esa carpeta en modo lectura y abre la conversación; **Cancelar** descarta la recepción. La precarga no envía contenidos a Ollama. Solo una carpeta por vez, todavía sin archivos sueltos ni PDF.

El chat ahora muestra Markdown, listas, tablas y bloques de código con botón Copiar. No ejecuta código ni HTML recibido. Movimiento reducido respeta la preferencia del sistema.

Validación pendiente en Windows: arrastrar desde Explorador sobre cada borde, salir sin soltar, cancelar, cambiar carpeta y probar escalado de pantalla.


### Corrección 0.12.1

Con el chat abierto, arrastrar otra carpeta conserva el tamaño y la posición de la ventana. El panel muestra una zona de recepción con Bimu, manteniendo la conversación de fondo. Cancelar o salir del arrastre restaura el chat; aceptar comparte la nueva carpeta. La recepción compacta queda reservada al notch minimizado.


## Beta 0.13: historial y memoria personal

El historial local guarda automáticamente hasta 20 conversaciones con los últimos 40 mensajes de cada una, incluidas respuestas interrumpidas. Desde **Chat → Historial** podés recuperar, renombrar o borrar conversaciones, o borrar todo el historial. Al alcanzar 1,5 MB se descartan los chats más antiguos. Los cambios se guardan al terminar o detener la respuesta, no durante cada fragmento del streaming.

**Ajustes → Lo que Bimu recuerda** permite escribir, guardar y borrar hasta 2000 caracteres de preferencias explícitas. Se envían a Ollama en los próximos mensajes; no se extraen recuerdos automáticamente ni se otorgan permisos por medio de esa memoria.

El historial contiene los textos de la conversación (incluidas respuestas sobre archivos). Se guarda en el almacenamiento local de la app, sin cifrado adicional. Memoria e historial se borran por separado. Las carpetas y los permisos no se guardan: al reiniciar o recuperar un chat hay que compartirlas de nuevo. Cambiar o quitar una carpeta inicia un chat nuevo y conserva los anteriores en el historial. Los errores de lectura o escritura local se muestran en pantalla.

Pendiente de validación en Windows: cerrar/reabrir Bimu, recuperar/borrar chats y verificar las preferencias con el modelo elegido.


## Beta 0.14: hablar con Bimu (Windows x64)

1. Actualizá el repositorio con `git pull origin main` y ejecutá `npm install`.
2. Prepará el motor **una vez**, desde la carpeta del proyecto:

   ```powershell
   npm run voice:setup
   ```

   Descarga whisper.cpp **v1.9.2 CPU x64** (~8 MB) y `ggml-base.bin` multilingüe (~142 MiB). Los archivos quedan en `%LOCALAPPDATA%\Bimu\voice`, fuera del repositorio. El script verifica el SHA-256 del ZIP publicado por GitHub y el SHA-1 del modelo publicado por whisper.cpp. No requiere administrador. La descarga inicial necesita Internet; no se usa una API de pago.

3. Iniciá Whisper y dejá esta terminal abierta:

   ```powershell
   npm run voice:start
   ```

   Usa solo `127.0.0.1:8081`, CPU, 4 hilos y español, sin mantener contexto de audios anteriores. Ctrl+C detiene el motor. Si el puerto está ocupado, cerrá el proceso que lo ocupa; por ahora el puerto es fijo.

4. En **otra terminal**, ejecutá `npm run desktop:dev`. En **Ajustes → Hablá con Bimu**, elegí **Autorizar y detectar micrófonos**, seleccioná tu dispositivo y presioná **Comprobar motor local**. Windows/WebView2 puede solicitar acceso al micrófono. Si se bloquea, revisá Configuración de Windows → Privacidad → Micrófono y el acceso para aplicaciones de escritorio.
5. Abrí **Chat**, pulsá el micrófono, hablá y pulsá el botón de detener. La grabación termina automáticamente a los 30 segundos. La transcripción se agrega al borrador existente, separada por una línea: revisala, corregila y recién después presioná Enviar. **No se envía automáticamente.**

Durante la grabación se muestra “Escuchando” y un contador. Podés cancelar tanto la grabación como la espera de transcripción. Salir del chat, volver al notch, ocultar la ventana o cerrarla en la bandeja libera el micrófono y descarta cualquier resultado tardío. Si cerrás mientras Windows pide permiso, una autorización tardía tampoco deja el micrófono encendido.

Bimu mantiene el audio en memoria, lo convierte a WAV PCM mono de 16 kHz y lo envía únicamente al servidor Whisper en el mismo equipo. Bimu no escribe grabaciones en disco ni guarda audio en el historial. La opción de conversión por FFmpeg de Whisper no se habilita. Solo el texto que enviás pasa al chat/Ollama. Se detectan silencios, micrófono desconectado, permiso denegado y motor no iniciado.

Esta entrega usa CPU para facilitar la primera prueba. No incluye respuesta hablada, escucha continua, palabra clave ni apertura de aplicaciones por voz. Queda medir latencia y consumo reales en Windows y, si hace falta, sumar aceleración por GPU. El motor se prepara e inicia manualmente en esta beta; todavía no está incluido en el instalador ni se inicia con Bimu.

Fuentes de preparación: [release oficial v1.9.2](https://github.com/ggml-org/whisper.cpp/releases/tag/v1.9.2), [modelos y hashes](https://github.com/ggml-org/whisper.cpp/blob/v1.9.2/models/README.md), [servidor y API](https://github.com/ggml-org/whisper.cpp/blob/v1.9.2/examples/server/README.md).

Validación disponible: pruebas JS de WAV y errores; simulaciones de permiso/dispositivo, grabar/detener, transcripción, cancelación, resultados tardíos y motor desconectado. Pendiente en Windows: ejecución de PowerShell, compilación Rust, permiso real del WebView, captura del dispositivo y transcripción con el modelo descargado.


### Corrección de inicio de voz (0.14)

El script de inicio no debe pasar `-nc`: el servidor de whisper.cpp v1.9.2 no reconoce esa opción y termina antes de cargar el modelo. El servidor ya establece `no_context = true` por defecto. Si aparece `unknown argument: -nc`, actualizá con `git pull origin main` y ejecutá nuevamente `npm run voice:start`. No hace falta repetir `voice:setup`.

Para comprobar que el motor ya cargó, desde otra terminal PowerShell:

```powershell
Invoke-RestMethod http://127.0.0.1:8081/health
```

La respuesta debe indicar `status: ok`. El texto “Iniciando Whisper” del script solo anuncia el intento de arranque.


### Dictado: segmentos y reconocimiento

Bimu pide al servidor `split_on_word=true` y `token_timestamps=false` para evitar segmentos cortados dentro de una palabra. Los saltos de línea y espacios repetidos devueltos por Whisper se convierten en espacios antes de agregar el dictado al borrador. Esto no modifica el texto que ya escribiste en el borrador. Se incluye `Bimu.` como referencia de vocabulario para el nombre del asistente; no es un reemplazo automático de palabras.

La limpieza de formato no corrige errores acústicos ni garantiza que Whisper base reconozca siempre el nombre u otras palabras. El texto sigue siendo editable antes de enviarlo. Pendiente de comparar precisión real tras este ajuste en Windows.


## Beta 0.15: aplicaciones y varios documentos

### Abrir aplicaciones por texto o dictado

En Chat, escribí **Bimu, abrí Spotify** (también `abrí Calculadora`, `abre Chrome`, `abrime VS Code`). Por voz: grabá, revisá la transcripción y enviá el mensaje. El pedido usa la misma ruta que el texto; no se dispara una apertura mientras se está transcribiendo. Las aperturas directas no necesitan una respuesta de Ollama.

La primera apertura muestra el nombre y destino registrado, con **Abrir aplicación** y **Cancelar**. Podés marcar **Recordar permiso** para esa aplicación. Desde **Ajustes → Aplicaciones** podés revocarlo, editar nombre/alias, quitar entradas y registrar otro `.exe` mediante el selector nativo. No se aceptan rutas o argumentos de terminal dictados por el usuario o generados por el modelo. Solo se abre el destino fijo registrado, sin argumentos.

Incluye entradas para Spotify (protocolo de Windows `spotify:`), Calculadora, Bloc de notas, Chrome, Edge y Visual Studio Code. La disponibilidad se comprueba en el equipo. Para una instalación en una ruta distinta, registrá su `.exe`; podés quitar la entrada anterior y asignar su nombre/alias a la nueva. Esta versión no registra protocolos arbitrarios de otras apps ni accesos `.lnk`. Spotify debe tener su protocolo instalado.

La configuración se guarda localmente en el directorio de configuración de Bimu, archivo `applications-v1.json`. Las solicitudes fallidas muestran el error real; una solicitud aceptada por Windows se registra como “Se solicitó la apertura”, sin afirmar que la app terminó de iniciar. Un archivo analizado o una respuesta del modelo nunca llama al motor de aperturas: solo el texto enviado directamente por el usuario puede hacerlo.

### TXT, PDF, DOCX, XLS y otros adjuntos

Usá **Chat → Agregar archivos**, o arrastrá varios archivos juntos al notch o al chat abierto. Conserva la recepción animada de Bimu y el tamaño del chat abierto. Al soltar, se prepara el contenido localmente y se muestra cuántos se pudieron leer; **Ver archivos** muestra errores por archivo (desde el notch abre el panel para disponer de espacio). **Usar en el chat** comparte solo los que se pudieron preparar. La precarga no envía documentos a Ollama.

Formatos implementados: TXT, PDF con texto, DOCX, XLS, XLSX, ODS, CSV, TSV, Markdown, JSON, logs y texto de código compatible. TXT admite UTF-8 y UTF-16 con BOM. Los PDF escaneados, OCR, imágenes, `.doc` antiguo y documentos protegidos o dañados quedan pendientes o muestran un error. DOCX extrae párrafos del cuerpo; no analiza imágenes, notas ni encabezados. Las planillas usan valores guardados, sin recalcular fórmulas ni ejecutar macros. No se requiere Office ni un servicio externo.

Límites de esta beta: hasta **10 archivos compartidos**, **10 MiB por archivo** y **30 MiB por lote**; hasta **64 KiB de texto por archivo**. Las planillas incluyen hasta 8 hojas, 200 filas y 30 columnas por hoja; los recortes se indican como extracto parcial. Los contenedores Office se limitan a 32 MiB descomprimidos. Por mensaje de Ollama, los adjuntos tienen un presupuesto de 192 KiB de texto, 16 consultas y 12 rondas; si se alcanza, continuá con menos documentos o una pregunta más específica.

Podés agregar otro lote al conjunto actual o quitar archivos individualmente. Al quitar un archivo se inicia un chat nuevo, conservando el anterior en el historial. Compartir una carpeta reemplaza los adjuntos; pasar de carpeta a archivos también inicia otro chat. No se mezclan carpetas y archivos en un mismo arrastre. Las carpetas compartidas ahora también permiten extraer los formatos compatibles mediante `read_file`.

Los adjuntos son una instantánea de texto al compartirlos: no dan acceso a archivos vecinos ni se actualizan solos si cambiás el original. Al reiniciar, recuperar un chat o quitar el acceso hay que compartirlos de nuevo. El historial puede contener respuestas sobre documentos ya enviados. En la beta 0.16, los archivos adjuntos se incluyen como contexto y no requieren soporte de herramientas. La navegación de carpetas sí lo requiere.

### Validación de esta entrega

- `npm test`: reglas de intención, comandos cliente, geometría, voz e historial.
- `npm run test:native`: el mismo núcleo Rust de lectura, límites de alcance, selección múltiple, XML DOCX, alias e intención, sin necesitar WebView.
- Extracción real comprobada aquí con archivos de muestra TXT, PDF, DOCX, XLS y XLSX.
- Simulaciones del frontend para confirmar/cancelar aperturas, recordar permiso, apps desconocidas y archivos múltiples.
- Pendiente en Windows: compilación completa de Tauri, apertura física de apps instaladas y selector/arrastre con documentos propios. La respuesta hablada sigue pendiente por decisión del usuario.


## Beta 0.16: manos libres y adjuntos reconocidos desde el primer mensaje

### Decir “Bimu, abrí Spotify” desde el notch

1. Dejá `npm run voice:start` abierto como en el dictado manual.
2. En **Ajustes → Aplicaciones**, activá **Abrir sin volver a preguntar** para las apps que quieras abrir directamente por voz. Si no lo habilitás, el pedido abre el panel de confirmación.
3. Elegí el dispositivo en **Ajustes → Hablá con Bimu** antes de activar la escucha.
4. En **Ajustes → Decí «Bimu»**, pulsá **Activar escucha de Bimu** y autorizá el micrófono. Luego podés volver al notch pequeño y usar el resto de la PC.
5. Decí en una misma frase **“Bimu, abrí Spotify”**, **“Hola Bimu, abre Calculadora”** u **“Oye Bimu, abrí Chrome”**. Al terminar de hablar, el silencio cierra la frase y Whisper la reconoce localmente. No hace falta pulsar el micrófono ni Enviar para una apertura reconocida.

También admite decir solo “Bimu”: cuando el indicador pase a “Te escucho”, hay 8 segundos para comenzar un segundo pedido. “Bimu, cancelá” desarma esa espera. Durante el reconocimiento hay una pausa de escucha, por eso la primera prueba conviene hacerla con nombre y pedido en una sola frase.

El indicador verde del notch significa escucha activa; ámbar indica reconocimiento o pausa por otra operación. Clic en el indicador desactiva el modo y libera el micrófono. **Bimu recuerda si activaste la escucha y la recupera al reiniciar**. Ocultar la ventana o cerrarla a la bandeja libera el micrófono sin borrar esa elección; mostrarla vuelve a activar la escucha guardada. Desactivarla con × o desde Ajustes guarda la preferencia apagada. Para cambiar de micrófono o volver al dictado manual, desactivá primero la escucha.

Es una implementación **experimental de VAD + Whisper**, no un detector dedicado y liviano de palabra clave. El VAD corre en un AudioWorklet, conserva 450 ms previos al inicio de voz, termina tras 900 ms de silencio y limita cada frase a 15 segundos. Las frases con voz se transcriben localmente para detectar si empiezan con Bimu; el resto se descarta sin agregarse al borrador o historial. No se envía audio a un servicio externo. Puede consumir CPU y la latencia depende de Whisper y del equipo. Solo hay una transcripción en curso: mientras se reconoce, no se encolan más grabaciones.

Los pedidos de apertura usan la misma lista nativa de aplicaciones, permisos y errores que el texto. Los demás pedidos dirigidos a Bimu abren el chat y se agregan al borrador para revisión; no se envían automáticamente a Ollama. La respuesta hablada sigue pospuesta.

### Adjuntos: contexto automático y nombres reales

Los adjuntos ya preparados se envían junto con la pregunta, incluyendo **sus nombres originales y texto disponible**. La comparación no depende de que el modelo decida llamar primero a `list_files` o `read_file`, ni necesita rutas proporcionadas por el usuario. Los identificadores internos `archivo-1`, `archivo-2` y rutas locales quedan fuera de este contexto; se indica al modelo que cite los nombres de los documentos.

Esta ruta funciona también con modelos de chat sin tool calling. La lectura de carpetas mantiene sus herramientas y sus comprobaciones anteriores. Los adjuntos se incluyen en las preguntas mientras estén compartidos, con un presupuesto total de texto de 192 KiB repartido entre todos; cualquier recorte se marca como parcial. No se guardan los textos completos de adjuntos en el historial por esta inclusión: solo los mensajes normales del usuario y las respuestas.

Verificación: pruebas unitarias de activación, VAD, silencios, límites, cancelación y contexto con nombres reales; simulación de escucha desde el notch, apertura sin botón de micrófono y uso de adjuntos con modelo sin herramientas. Pendiente de validación real en Windows: precisión, latencia y consumo de escucha continua, más comparación de los PDF del usuario tras el cambio de contexto.

### Ajuste de escucha manos libres (0.16.1)

Los comandos de apertura por voz conservan la vista actual y no generan conversaciones ni mensajes en el historial. La confirmación, cuando hace falta, aparece en una burbuja sin abrir el chat. La luz de borde usa el tema activo; rojo suave indica un pedido no reconocido o un error, verde una solicitud de apertura y amarillo el vencimiento de los ocho segundos para hablar después de activar con «Bimu». No se ilumina el borde pegado a la pantalla.

La captura conserva 800 ms previos y admite pausas de hasta 1,2 s. Whisper recibe ejemplos del nombre y comandos en español. Esto mejora el contexto de reconocimiento, pero no reemplaza un detector dedicado de palabra de activación: si Whisper no reconoce «Bimu», la frase se descarta y no hay activación ni aviso. Podés decir «Bimu», esperar «Te escucho…» y después el pedido. El dictado manual conserva su funcionamiento. La precisión, los colores y la captura reales requieren validación en Windows.


### Whisper con NVIDIA (opcional)

Windows x64: se conserva el motor CPU existente y el modelo base. Para preparar CUDA 12.4 desde el release oficial de whisper.cpp v1.9.2 (ZIP verificado con SHA256):

```powershell
npm run voice:setup:gpu
```

Detener el servidor anterior con Ctrl+C y luego:

```powershell
npm run voice:start:gpu
```

Las DLL CUDA se incluyen en el paquete oficial; se necesita un controlador NVIDIA compatible. Confirmar en la terminal `ggml_cuda` y el nombre de la GPU: iniciar en modo GPU no demuestra por sí solo que se haya utilizado. No se cambia a CPU silenciosamente desde el script. Si faltan DLL, falla el controlador o no alcanza la VRAM, detener y ejecutar `npm run voice:start` (CPU). Ambos modos usan 127.0.0.1:8081; no iniciarlos simultáneamente. Ollama no cambia y puede competir por VRAM con Whisper.

Comparar con la misma espera de 0,7 s y los mismos pedidos desde Ajustes → Decí «Bimu» → Medir la escucha, reiniciando la medición. Base observada en CPU: 17,6 s / 12 frases ≈ 1,47 s de procesamiento medio; máximo 2,33 s. Realizar un pedido de calentamiento antes de medir cada modo. La aceleración real está pendiente de validar en Windows.


## Bimu 0.17: instalación, voz integrada y actualizaciones

Descargar una vez `Bimu_0.17.1_x64-setup.exe` desde GitHub Releases y ejecutarlo con el usuario habitual. Mantiene el identificador de la app para conservar datos. No desinstalar borrando los datos de usuario. Windows puede advertir que el editor es desconocido: este instalador todavía no tiene certificado Authenticode.

Desde Ajustes → Configuración de Voz se puede preparar CPU o NVIDIA CUDA, iniciar/detener y consultar los registros. Reutiliza `%LOCALAPPDATA%\Bimu\voice`, el modelo y las descargas anteriores. Detener una vez el servidor que se hubiera iniciado manualmente. Bimu inicia el motor preparado al abrirse (opción desactivable), lo detiene al salir y nunca mata servidores externos. Abrir el motor no activa la escucha del micrófono. La preparación inicial necesita conexión y puede tardar varios minutos; la transcripción posterior es local.

Ajustes → Actualizaciones permite buscar versiones estables, descargar el instalador del repositorio oficial y verificar su tamaño y SHA256 publicado por GitHub. El botón de instalación vuelve a verificar el archivo, detiene el Whisper propio, abre el instalador interactivo y cierra Bimu. No usa instalación silenciosa. Abrir Bimu al terminar. Las compilaciones de desarrollo permiten comprobar/descargar, pero no lanzar instalación sobre `tauri dev`.

Para publicar otra versión, incrementar conjuntamente `package.json`, `package-lock.json`, `src-tauri/Cargo.toml` y `src-tauri/tauri.conf.json`. El workflow Windows corre los tests, compila NSIS y publica la release `vVERSION` en main. Una release existente no se reemplaza: los cambios posteriores requieren un número nuevo. Usa únicamente el GITHUB_TOKEN del workflow, sin claves privadas de firma adicionales. El SHA256 verifica integridad contra GitHub; no sustituye una firma de editor de Windows.

Los márgenes transparentes de Windows permiten hacer clic en la ventana detrás. El área interactiva sigue el panel y la burbuja durante las transiciones y mantiene la captura al arrastrar. El workflow verifica compilación/tests Windows; el comportamiento de clics, instalación y proceso CUDA requiere validación en la PC real.


### 0.17.2: transiciones y recepción de archivos

La ventana nativa conserva un marco único para reposo, hover, inicio y ajustes. Solo se anima el contenido, incluido el personaje, evitando el cambio de origen de pantalla durante abrir/contraer. Los márgenes mantienen el paso de clics. La captura de mouse se conserva únicamente si la pulsación comenzó sobre Bimu; un archivo arrastrado desde Explorer puede volver a activar la ventana al entrar en el panel. Probar en Windows ambos tamaños, entradas/salidas de archivos, soltar/cancelar, y cambios rápidos de tamaño.


## v0.18.0 · Ajustes y preferencias

- Seis submenús: Apariencia de UI, Apariencia de Bimu, Configuración de Voz, Configuración de la app, Aplicaciones y Actualizaciones. Memoria permanece en Configuración de la app; el motor Whisper se administra en Configuración de Voz.
- Transparencia de fondos configurable de 0 a 65%, guardada en este equipo. Textos, controles y personaje conservan su opacidad.
- La escucha «Bimu» recuerda la activación/desactivación explícita. Al abrir espera al motor local; si falta el motor muestra un error recuperable. No repite solicitudes de permiso al micrófono tras un rechazo. Ocultar pausa y mostrar recupera la preferencia; un error no la borra.
- Tras diez minutos sin interacción con Bimu se activa la animación de descanso. Interactuar o una invocación reconocida lo despierta; la escucha no se detiene. El ruido y las frases sin activación no reinician el descanso. No se duerme durante una respuesta del chat.
- La versión instalada se muestra en Actualizaciones. Se quitó la leyenda de acompañamiento y la versión del pie.

Prueba manual Windows: activar escucha y reiniciar; apagar y reiniciar; ocultar/mostrar; comprobar error con micrófono no disponible; cambiar tema/transparencia y reiniciar; visitar seis submenús en los cuatro bordes; esperar diez minutos y llamar «Bimu»; verificar que la escucha siga activa y el personaje despierte. Atajos compuestos, búsqueda global de carpetas y actualización sin asistente quedan pendientes.


## v0.19.0 · Atajos rápidos y carpetas

En Ajustes → Atajos rápidos creá una rutina con nombre, otras frases y entre 1 y 12 acciones. Cada acción puede abrir una aplicación registrada, una página http/https con navegador predeterminado o elegido, o una carpeta seleccionada con Windows. Podés ordenar las acciones, editar/eliminar el atajo y pedir confirmación o autorizar ejecución directa. «Bimu, modo trabajo» y «Ejecutá modo trabajo» usan el mismo atajo. Las aplicaciones anteriores permanecen en Aplicaciones disponibles, dentro del mismo submenú. Para Slack u otra app personalizada, registrá su ejecutable desde allí.

Ejemplo: nombre Modo trabajo → Slack → https://mail.google.com (Chrome) → dirección de tu Jira (Chrome). Se solicitan aperturas en ese orden; no espera a que cada aplicación termine de cargar, no inicia sesiones ni controla las páginas. Cada paso tiene su resultado, incluidos fallos parciales. Los comandos de voz conservan la regla de no agregarse al historial.

«Bimu, buscá una carpeta llamada fotos de viajes en mi PC y abrila» busca nombres de directorios sin registrarlos. Con una única coincidencia exacta en una búsqueda terminada solicita abrirla; múltiples coincidencias, coincidencias parciales o búsqueda incompleta muestran rutas para elegir. Se puede cancelar y volver a buscar dentro de una ubicación elegida.

La búsqueda recorre carpetas habituales del perfil y discos locales fijos/extraíbles; no utiliza Ollama ni lee el contenido de archivos. Tiene un límite de 15 segundos, 300.000 entradas y 50 coincidencias. No recorre red, carpetas del sistema, dependencias, enlaces/junctions ni ubicaciones sin acceso; carpetas de nube con puntos de reanálisis pueden quedar fuera. Si llega al límite lo indica: no equivale a haber revisado toda la PC. La lista solo permite abrir resultados reales de la búsqueda vigente; se vuelve a comprobar la carpeta al abrir.

Pruebas Windows: crear/editar/reordenar una rutina con app, Gmail/Jira y carpeta; ejecutar desde botón, chat y voz con/sin confirmación; reiniciar y verificar persistencia; probar una app quitada o carpeta movida y revisar fallos parciales; buscar dos carpetas del mismo nombre y elegir la correcta; cancelar durante la búsqueda; acotar a una ubicación. Los instaladores siguen usando el mecanismo de actualización existente.
