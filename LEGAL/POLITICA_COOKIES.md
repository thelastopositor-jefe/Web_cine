# Política de cookies y tecnologías similares — ToonKnight

**Estado: BORRADOR. La web no tiene actualmente un banner de consentimiento, según la información facilitada. Hace falta una auditoría técnica antes de decidir e implementar el mecanismo adecuado.**  
**Última revisión del borrador: 29 de octubre de 2026.**

## 1. Estado actual conocido

- No hay actualmente un banner de cookies, según lo indicado por el titular.
- La aplicación utiliza `localStorage` para conservar determinados datos en el navegador. Debe verificarse qué claves se guardan, para qué sirven y cuánto tiempo permanecen.
- Se utiliza Google Authentication y Firebase/Firestore.
- La web está alojada en Vercel.
- El formulario de contacto utiliza FormSubmit.
- Las miniaturas pueden cargarse desde servidores de YouTube/Google antes de abrir el reproductor. El reproductor se carga al abrir el detalle de un proyecto.
- No se ha declarado una herramienta de analítica independiente, pero deben revisarse el código y la web desplegada para comprobar que no existan otras integraciones.

Esta lista no es un inventario exhaustivo de cookies, almacenamiento, identificadores ni solicitudes de red. No se debe afirmar que el sitio no utiliza cookies o que solo utiliza cookies técnicas hasta completar la auditoría.

## 2. Consentimiento y preferencias

Debe determinarse, para cada tecnología, si es estrictamente necesaria o requiere consentimiento según su finalidad y funcionamiento real. Cuando se requiera consentimiento, las tecnologías correspondientes deben permanecer bloqueadas hasta obtenerlo. Las opciones de aceptar y rechazar deben presentarse al mismo tiempo, al mismo nivel y con la misma visibilidad, y debe existir una forma sencilla de modificar o retirar la elección.

La utilización de `youtube-nocookie.com` no garantiza por sí sola que no se realicen solicitudes externas ni sustituye una auditoría.

## 3. Cómo cambiar preferencias

**Pendiente de implementación:** no se ha confirmado que exista un panel o mecanismo para modificar preferencias. No debe publicarse una instrucción de gestión de preferencias hasta que exista y se haya probado.

## 4. Pendiente antes de publicar

- Auditar `https://toonknight.com` en una sesión limpia, antes y después de iniciar sesión, abrir un proyecto y enviar el formulario.
- Revisar cookies, `localStorage`, almacenamiento de sesión, solicitudes de red, dominios de terceros, finalidades y duración.
- Identificar qué tecnologías requieren consentimiento en la configuración real.
- Implementar un gestor de consentimiento si procede, con opciones equivalentes para aceptar y rechazar y un enlace persistente para cambiar preferencias.
- Bloquear previamente las tecnologías que requieran consentimiento.
- Actualizar este documento con un inventario basado en resultados comprobados.

Referencia de la AEPD sobre cookies: https://www.aepd.es/guias/guia-cookies.pdf
