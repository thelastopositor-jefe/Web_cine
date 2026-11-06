# Cambios incluidos en esta entrega

## Archivos

- `src/App.jsx` — versión del archivo principal con la pestaña «Empleo» añadida al menú de escritorio y al menú móvil, y el componente nuevo integrado.
- `src/components/JobsSection.jsx` — componente React de anuncios, búsqueda, filtros, formulario, contacto, edición, cierre, reapertura, eliminación y denuncias.
- `FIRESTORE_RULES_EMPLEO.txt` — reglas que hay que integrar con las reglas existentes de Firestore.
- `README_EMPLEO_Y_COLABORACIONES.md` — instrucciones de instalación y pruebas.

## Antes de publicar

La compilación no se ha podido verificar en este entorno porque `vite` no está instalado y la instalación de dependencias no terminó. En tu equipo, dentro del proyecto, ejecuta `npm ci` y `npm run build`.

No se ha desplegado ni modificado directamente Firebase. La sección necesita que las reglas de `FIRESTORE_RULES_EMPLEO.txt` se integren y publiquen en Firestore para poder crear, editar, cerrar, eliminar y denunciar anuncios. No reemplaces las reglas existentes de otras colecciones.
