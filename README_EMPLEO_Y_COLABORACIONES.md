# OnlyToonKnight: sección «Empleo y colaboraciones»

## Archivos incluidos

- `src/components/JobsSection.jsx`: listado en tiempo real, búsqueda, filtros, publicación y edición de anuncios, cierre/reapertura, eliminación y denuncias.
- `src/App.jsx`: integra la sección en la navegación de escritorio y móvil.
- `FIRESTORE_RULES_EMPLEO.txt`: bloque de reglas de seguridad que debe integrarse en las reglas actuales de Firestore.

## Funciones incluidas

- Tipos de anuncio: empleo, colaboración y servicio.
- Búsqueda por palabras clave.
- Filtros por especialidad, país, modalidad y estado del anuncio.
- Campos de título, descripción, remuneración, país, modalidad, contacto opcional y portafolio opcional.
- Los usuarios autenticados pueden publicar, editar, cerrar/reabrir y eliminar sus anuncios.
- Los moderadores configurados en `src/App.jsx` pueden gestionar o eliminar cualquier anuncio.
- Los usuarios autenticados pueden denunciar anuncios; las denuncias se guardan en `jobReports`.
- Los anuncios se sincronizan con Firestore en tiempo real.

## Pasos para instalar

1. Haz una copia de seguridad del proyecto actual.
2. Copia `src/components/JobsSection.jsx` a la misma ruta del proyecto.
3. Usa el `src/App.jsx` incluido en este paquete (ya incorpora la sección) o aplica manualmente los cambios de importación, navegación y renderizado.
4. Abre Firebase Console → Firestore Database → Rules. Integra el contenido de `FIRESTORE_RULES_EMPLEO.txt` en las reglas existentes. **No borres ni reemplaces las reglas de las demás colecciones.** Revisa y publica las reglas cuando estés seguro de que siguen protegiendo el resto de la aplicación.
5. Ejecuta `npm install` si fuera necesario y después `npm run build` para comprobar la compilación.
6. Prueba con una cuenta normal: publicar, editar, cerrar, reabrir, eliminar y denunciar. Prueba también con una cuenta de moderador.

## Consideraciones importantes

- La colección `jobListings` comienza a utilizarse al crear el primer anuncio; no hace falta crearla manualmente en Firestore.
- `jobReports` comienza a utilizarse cuando alguien envía una denuncia.
- El correo y el teléfono son opcionales. Si el usuario los incluye, se muestran públicamente en el anuncio.
- La moderación de denuncias se guarda en Firestore, pero esta primera versión no añade una bandeja de denuncias dentro del panel de moderación existente. Las denuncias se pueden consultar en la colección `jobReports` desde Firebase Console; se puede integrar un panel posteriormente.
- Los moderadores están identificados en el cliente mediante las direcciones que ya aparecen en `src/App.jsx`. Las reglas de Firestore repiten esa lista para autorizar las operaciones del servidor.
- No se ha desplegado nada en Firebase ni en la web. Estos archivos deben probarse en el entorno del proyecto antes de publicarlos.
