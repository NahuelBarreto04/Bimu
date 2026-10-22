# Bimu · Beta v0.7

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
- **Hover:** se amplía a un tamaño intermedio y muestra una invitación a abrirlo. Al salir vuelve al estado pequeño tras 200 ms.
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

## Chat y conexiones

Son interfaces preparadas para la siguiente etapa: no envían mensajes ni conectan servicios. El borrador del chat se guarda localmente. Ollama, GitHub, Vercel y n8n muestran estado pendiente.

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
