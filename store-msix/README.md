# Bimu: paquete MSIX experimental

Este paquete es solo para pruebas en una PC propia. La firma de prueba se genera de nuevo en GitHub Actions en cada compilación: no es una firma de Microsoft ni sirve para distribuir la aplicación. No se incluye la clave privada. El certificado público solo debe instalarse tras verificar que el artefacto provenga de la ejecución esperada.

Antes de instalar: cerrá Bimu, respaldá sus datos y no actives el inicio automático ni el instalador de actualizaciones desde la versión experimental. El paquete todavía no implementa las adaptaciones de inicio automático ni actualizaciones de Store. Puede usar datos separados o compartirlos según la virtualización de Windows; no se ha verificado migración.

Para una prueba aislada en Windows, descargá el artefacto Bimu-MSIX-experimental de la ejecución de esta rama y verificá el SHA-256. Instalá el certificado público temporal de prueba en Trusted People del equipo solo si confiás en el origen; eso concede confianza a paquetes firmados con ese certificado. Luego instalá el MSIX. Retirá la aplicación y el certificado de prueba al terminar. No compartas este paquete con usuarios finales.

Para Store falta verificar la identidad, los recursos, los requisitos y certificación, adaptar inicio y actualizaciones y probar el portapapeles, archivos y vínculo en equipos reales.
