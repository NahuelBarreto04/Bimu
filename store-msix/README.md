# Paquetes MSIX de Bimu

La compilación experimental crea dos archivos distintos:

- Bimu-experimental.msix: firmado con un certificado temporal para pruebas privadas. Bimu-test.cer contiene la clave pública de esa firma, nunca la clave privada. El certificado se crea de nuevo en cada ejecución y debe retirarse después de las pruebas.
- Bimu-Store-sin-firmar.msix: paquete para validar y presentar en Partner Center. No se puede instalar directamente como el paquete de prueba y no incluye el certificado temporal.

La compilación por sí sola no garantiza la aceptación de Microsoft ni la compatibilidad de todas las funciones. No enviar el paquete a certificación hasta revisar la ficha, los datos de privacidad, las capacidades, la instalación y actualización desde Store. Microsoft firma el paquete para distribuirlo desde su tienda.

Para una prueba aislada descargá Bimu-MSIX-experimental de la ejecución esperada, compará su hash con SHA256.txt, y solo si confiás en el origen instalá temporalmente Bimu-test.cer en Trusted People del equipo. Cerrá la instalación existente y respaldá los datos antes de probar. Quitá el paquete y el certificado temporal al terminar. Nunca compartir la firma de prueba como una firma de Microsoft.

Marian probó en una PC la instalación, configuración preservada, inicio activado y desactivado y el mensaje de actualizaciones de Store. Siguen pendientes la prueba de actualización real desde Store y la revisión de portapapeles, archivos y vinculación entre dos equipos bajo MSIX.
