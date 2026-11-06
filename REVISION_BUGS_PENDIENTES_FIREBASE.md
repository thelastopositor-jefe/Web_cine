# Revisión de incidencias de ToonKnight

## Cambios visuales incluidos
- La sección «Empleo y colaboraciones» ahora muestra tarjetas compactas.
- La descripción completa, el autor y los datos de contacto aparecen al pulsar «Ver detalles».
- El mensaje de error del formulario de contacto ahora recuerda comprobar la activación inicial de FormSubmit.

## Pendiente de las reglas actuales de Firestore
Este proyecto ZIP no incluye el archivo `firestore.rules` ni las reglas actualmente publicadas en Firebase Console. Por seguridad, no se han inventado ni sustituido reglas completas.

Para resolver las denuncias de `reports` y permitir que cada autor borre sus propios proyectos, hay que revisar las reglas reales publicadas. La interfaz ya intenta crear documentos en `reports` y borrar proyectos propios; si Firestore lo rechaza, la autorización se debe corregir en las reglas del servidor, no solo en React.

## Eliminación de cuenta y moderación de usuarios
Eliminar una cuenta de Firebase Authentication, deshabilitarla o borrar de forma fiable todo su contenido requiere código privilegiado del lado del servidor (por ejemplo, Firebase Cloud Functions con Admin SDK) y reglas que impidan a usuarios normales invocar acciones de moderación. No debe implementarse usando credenciales administrativas en el navegador.

Antes de añadir estas acciones al panel, hay que definir y desplegar esas funciones del servidor y probarlas en el proyecto Firebase correcto. No se ha añadido un botón que aparente borrar la cuenta sin poder completar realmente el borrado.

## FormSubmit
El frontend usa el endpoint AJAX habitual `https://formsubmit.co/ajax/contacto@toonknight.com`. Si sigue fallando, hay que comprobar el error exacto en la consola/red del navegador y confirmar que FormSubmit activó ese destinatario. El código del navegador no puede activar por sí solo la dirección ni garantizar la entrega del correo.
