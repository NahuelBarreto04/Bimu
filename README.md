# Bimu · Beta v0.11

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
