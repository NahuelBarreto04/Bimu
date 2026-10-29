# Política de privacidad de Bimu — borrador para revisión

Estado: no publicado. Este texto se basa en la revisión de la versión experimental de Bimu y debe verificarse y completarse antes de su publicación.

## Responsable y contacto

Bimu es desarrollado por Mariano Arias. Para consultas sobre esta política o solicitudes relacionadas con datos de Bimu, el contacto propuesto es https://github.com/marianoarias1/Bimu/issues. Las incidencias de GitHub son públicas: no incluyas contraseñas, documentos privados ni otra información sensible. Antes de publicar, el responsable debe confirmar un canal privado de contacto.

## Alcance

Esta política describe la aplicación Bimu para Windows. Las plataformas de terceros, incluidos Microsoft Store, GitHub y los proveedores indicados a continuación, tienen sus propias políticas.

## Datos usados en el equipo

- Portapapeles: al activar el historial, Bimu puede leer y mostrar texto, imágenes y referencias a archivos copiados. El historial se mantiene durante la sesión, se puede pausar y sus elementos se pueden eliminar o vaciar. Los archivos recibidos de otro equipo pueden guardarse en el disco por separado y vaciar el historial no garantiza borrarlos.
- Archivos a mano y atajos: Bimu guarda información como nombres y rutas de los elementos y las acciones que configurás para permitirte volver a abrirlos. Los archivos que compartís o recibís pueden contener información personal.
- Preferencias: Bimu almacena opciones como la apariencia, páginas visibles, configuración de inicio y ubicación seleccionada para el clima.
- Música: Bimu lee información de la sesión de reproducción proporcionada por Windows, como título, artista y estado, para mostrar el reproductor.
- Dispositivos: si vinculás equipos, Bimu utiliza nombres e información de red del dispositivo y guarda información de la vinculación para permitir la reconexión. En Windows protege la credencial persistente de vinculación mediante DPAPI, asociada al usuario.

## Sincronización entre equipos

Al vincular dos equipos, Bimu los descubre en la red local y puede sincronizar automáticamente contenido compatible del portapapeles y compartir información y archivos de Archivos a mano. Esos datos se envían al otro equipo vinculado, que puede conservar copias locales. La conexión usa autenticación y cifrado durante la transmisión.

Pausar el historial del portapapeles no necesariamente detiene la sincronización si la conexión entre equipos sigue activa. Para detener el intercambio entre ellos, desvinculalos o cerrá Bimu en uno de los equipos. Los permisos y la seguridad de los dos equipos y de la red también influyen en la protección del contenido.

## Servicios externos

Cuando usás estas funciones, Bimu hace solicitudes a servicios de terceros, que reciben la dirección IP de la conexión y los datos necesarios para responder:

- Ubicación aproximada: si elegís detectarla, se consulta ipapi.co utilizando tu conexión. Alternativamente podés buscar una ciudad manualmente.
- Clima: se consulta Open-Meteo con el texto de la ciudad buscada o con las coordenadas de la ubicación seleccionada.
- Letras: se consulta LRCLIB con el título y artista de la canción.
- Actualizaciones: la instalación distribuida por GitHub consulta GitHub para comprobar o descargar versiones. La versión instalada como paquete utiliza Microsoft Store para sus actualizaciones.

Las solicitudes están sujetas a las políticas y prácticas de cada proveedor. Bimu no controla el tratamiento que esos proveedores hagan de la información que reciben.

## Conservación y controles

Podés pausar y vaciar el historial, quitar elementos de Archivos a mano, modificar tus preferencias y desvincular equipos desde Bimu. La desvinculación elimina la credencial persistente de vinculación en ese equipo; no implica borrar automáticamente todas las copias de archivos ya recibidas en cualquiera de los equipos. Revisá las carpetas de datos de Bimu y las copias que hayas guardado si querés eliminarlas. La desinstalación puede comportarse de forma distinta según el método de instalación, por lo que no se promete que elimine todos los datos.

## Sitio web y distribución

El sitio de Bimu usa GitHub Pages para alojar su contenido, carga tipografías desde Google Fonts y consulta GitHub para localizar la última descarga. Estos servicios reciben datos técnicos de la solicitud, incluida la dirección IP, según sus respectivas políticas. La descarga desde Microsoft Store está sujeta también a las condiciones y a la política de privacidad de Microsoft.

## Seguridad y cambios

La transmisión entre equipos vinculados usa un canal autenticado y cifrado y la credencial persistente se protege con DPAPI. Esto no garantiza seguridad absoluta ni cifra necesariamente todos los archivos almacenados. Esta política debe actualizarse si cambia el tratamiento de datos.

## Pendiente antes de publicar

Confirmar un canal privado de contacto y revisar almacenamiento, retención, uso de servicios, seguridad y derechos aplicables con asesoramiento adecuado. Comprobar si la experiencia de la aplicación y sus permisos de sincronización cumplen los requisitos de consentimiento y privacidad de Microsoft Store. No publicar este borrador como política definitiva hasta completar dicha revisión.
