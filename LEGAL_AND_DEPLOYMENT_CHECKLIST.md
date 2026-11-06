# ToonKnight — lista de revisión legal y técnica

Dominio previsto: https://toonknight.com/

**Importante:** los textos legales incluidos en la interfaz son borradores de trabajo y contienen campos entre corchetes. No se deben considerar definitivos ni publicarse como cumplimiento legal completo hasta completar y verificar los datos.

## Antes de publicar los textos

- [ ] Identificar al titular legal y determinar qué domicilio/dirección debe figurar según la situación real del responsable. WHOIS Privacy protege el registro del dominio, pero no sustituye los datos que legalmente deban aparecer en el aviso legal.
- [ ] Elegir un correo de contacto estable y supervisado y usarlo en aviso legal, privacidad y reclamaciones.
- [ ] Completar la política de privacidad con los tratamientos reales, bases jurídicas, plazos de conservación, destinatarios/encargados, transferencias internacionales y procedimiento para ejercer derechos.
- [ ] Revisar la configuración de Firebase Authentication, Firestore y Google; comprobar los términos aplicables y los acuerdos de tratamiento correspondientes.
- [ ] Revisar FormSubmit y confirmar qué datos recibe, dónde se procesan y cómo se conservan los mensajes.
- [ ] Auditar en el dominio desplegado cookies, localStorage, peticiones de red y tecnologías de YouTube/Google, incluidas las miniaturas que se descargan antes de abrir el reproductor.
- [ ] Según el resultado de esa auditoría, implementar una solución de consentimiento que bloquee las tecnologías no necesarias cuando sea exigible y permita aceptar, rechazar y configurar con opciones igualmente accesibles. La política de cookies actual es solo un borrador: no hay todavía un gestor de consentimiento implementado por este cambio.
- [ ] Sustituir los campos [ENTRE CORCHETES] y eliminar cualquier texto que no describa exactamente el comportamiento real.
- [ ] Si se activan afiliados, etiquetar cada enlace comercial junto a la recomendación. Revisar también las obligaciones fiscales y de consumo antes de monetizar o vender cursos.

## Denuncias y Firestore

La interfaz añade un formulario de denuncia que intenta crear documentos en la colección `reports` de Firestore. **La función solo operará si las reglas de seguridad de Firestore permiten el envío de denuncias de forma controlada.** No se han modificado reglas porque no venían incluidas en este ZIP. Antes del despliegue:

- [ ] Crear/revisar reglas para `reports` que validen campos y tamaños, eviten que usuarios lean denuncias de otras personas y restrinjan la moderación a administradores autorizados.
- [ ] No permitir que el cliente cambie libremente `status` ni consulte datos privados de quien denuncia.
- [ ] Probar denuncias con sesión iniciada y sin sesión iniciada, si se decide permitir ambas.
- [ ] Definir un procedimiento de revisión, respuesta y conservación de denuncias.

## Funcionalidad de campañas

- El formulario de proyecto incluye un enlace opcional de campaña (Kickstarter u otra plataforma).
- Los proyectos con enlace de campaña aparecen también en el filtro «Crowdfunding / Kickstarter» y muestran un enlace externo en el detalle.
- Los proyectos también pueden seleccionarse directamente como categoría «Crowdfunding / Kickstarter».
- Verificar que los enlaces aportados por usuarios se abren en una pestaña nueva y que la moderación revisa enlaces sospechosos.

## Nombre del proyecto

La marca visible y el dominio son ToonKnight / toonknight.com. Se conservan identificadores internos históricos de Firebase y de `localStorage` que contienen `onlytoon`/`onlytoons`, porque cambiarlos sin una migración podría romper autenticación, datos o sesiones. El identificador interno del proyecto Firebase también permanece igual.


## Documentos legales personalizados

Los borradores de trabajo personalizados están en `LEGAL/`: aviso legal, privacidad, cookies, condiciones de uso, transparencia comercial y lista de pendientes. No se consideran definitivos hasta completar el domicilio y verificar los tratamientos técnicos.

El correo público mostrado en el modal de contacto es `contacto@toonknight.com`. Mientras el buzón corporativo no esté configurado, el formulario sigue reenviando internamente a `contacto@toonknight.com` a través de FormSubmit; actualizar el destino cuando el buzón corporativo esté operativo.
