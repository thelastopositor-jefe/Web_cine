# Actualización de ToonKnight — notas técnicas

Este paquete contiene una primera implementación de las mejoras acordadas sobre el ZIP recibido el 03-11-2026.

## Cambios implementados en el código

- Orden de «Lo más reciente» por `createdAt` (fecha de incorporación a ToonKnight); los proyectos sin fecha quedan al final y no se inventan fechas.
- Edición de temporadas y episodios en proyectos de tipo Serie, preservando campos existentes y validando enlaces reales de YouTube.
- Carrusel sincronizado desde `carouselItems`, con administración desde el panel, importación de los elementos actuales y límite de 8 imágenes.
- Corregida la extensión de la imagen local `carousel06.jpeg`.
- Enlaces de proyectos con `?project=ID` sincronizados al abrir/cerrar tarjetas y al usar atrás/adelante del navegador.
- Sección «Destacados» entre el carrusel y «Lo más reciente», cuatro tarjetas visibles, selección aleatoria al cargar y rotación cada 4 segundos.
- Gestión de proyectos destacados desde moderación, sin límite de proyectos seleccionados.
- Likes únicos por UID mediante Cloud Function `likeProject`; las visitas se cuentan con una Cloud Function y se deduplican por usuario/IP durante un día (los identificadores de visita se purgan a los 30 días).
- Secciones «Noticias» y «Recursos», con gestión para moderadores, categorías, noticias destacadas, varias imágenes por noticia y enlaces externos. Los moderadores pueden subir imágenes desde el ordenador (hasta 5 MB cada una) o usar URLs; Storage limpia los archivos sustituidos/eliminados.
- Perfiles públicos separados de los documentos privados `users`, con enlaces sociales, portafolio, edición propia, subida de avatar/banner, denuncias, bloqueos y eliminación de cuenta.
- Distintivo Patreon con borde degradado, resplandor y archivo de imagen reemplazable en `public/images/patreon-badge.svg`.
- Mensajería privada, límite de 500 caracteres, sin enlaces ni adjuntos, máximo de 3 mensajes seguidos sin respuesta y límite de frecuencia adicional.
- Bloqueo bilateral de mensajes, denuncias de mensajes/usuarios/proyectos y panel de revisión.
- Campana de notificaciones, mensajes, aprobaciones/rechazos y avisos generales distribuidos a todos los usuarios registrados.
- Registro de acciones de moderación.
- Eliminación controlada de cuentas y contenido propio: proyectos, series, anuncios de empleo, publicaciones y comentarios de foro; se preservan las denuncias y el registro de moderación para investigación. Las denuncias resueltas se conservan 180 días desde su resolución y luego se purgan automáticamente; las pendientes no se eliminan.
- Eventos de analítica enviados a `dataLayer` para que Google Tag Manager/Analytics existente pueda recogerlos; no se vuelve a instalar Analytics.

## No desplegar todavía

El ZIP original no incluye las reglas completas que están publicadas en Firestore ni en Storage. Por seguridad, no se ha creado un `firestore.rules` o `storage.rules` sustitutivo: reemplazar reglas desconocidas podría romper el catálogo actual o dejar datos expuestos.

Antes de publicar:

1. Hacer una copia de seguridad de Firestore.
2. Obtener las reglas actuales desde Firebase Console > Firestore Database > Rules.
3. Integrar los bloques de `FIRESTORE_RULES_REQUIRED.md` con las reglas actuales, revisando especialmente `projects`, `users`, `reports`, `jobReports` y `publicProfiles`.
4. Integrar también `STORAGE_RULES_REQUIRED.md` con las reglas actuales de Storage; no sustituir las reglas que ya protegen otros archivos.
5. Probar con Firebase Emulator Suite y comprobar lectura/escritura con usuario normal y moderador.
6. Instalar dependencias y compilar la web.
7. Desplegar Cloud Functions y reglas; después publicar el frontend.

## Cloud Functions

Se incluye `functions/index.js` con funciones callable y triggers para operaciones sensibles. Usa Node.js 22. Node.js 20 alcanzó su fecha de retirada el 30-10-2026, así que no conviene desplegar funciones nuevas con ese runtime. La implementación de Cloud Functions requiere que el proyecto use el plan Blaze. La limpieza programada de denuncias usa Cloud Scheduler, también sujeto a las condiciones de facturación del proyecto.

En PowerShell, desde la carpeta del proyecto:

```powershell
firebase login
firebase use onlytoon-82f3f
cd functions
npm install
npm run lint
cd ..
# Grupo 1 (10 funciones)
firebase deploy --only functions:getCreatorProjects,functions:recordProjectView,functions:likeProject,functions:sendDirectMessage,functions:markNotificationRead,functions:setPatreonSupporter,functions:setUserBlock,functions:reportContent,functions:moderateProject,functions:setProjectFeatured

# Grupo 2 (10 funciones)
firebase deploy --only functions:deleteProjectAsModerator,functions:reviewReport,functions:sendBroadcast,functions:purgeExpiredReports,functions:distributeBroadcast,functions:syncProjectSupporterBadge,functions:notifyProjectModeration,functions:auditNewsCreated,functions:auditNewsUpdated,functions:auditNewsDeleted

# Grupo 3 (9 funciones)
firebase deploy --only functions:auditResourceCreated,functions:auditResourceUpdated,functions:auditResourceDeleted,functions:auditCarouselCreated,functions:auditCarouselUpdated,functions:auditCarouselDeleted,functions:deleteUserAccount,functions:cleanupPublicProfileAssets,functions:deletePublicProfileAssets
```

Despliega los grupos en orden, uno por uno, y espera a que cada grupo termine correctamente. Firebase recomienda desplegar grupos de 10 o menos cuando hay muchas funciones. No ejecutes el despliegue hasta integrar y probar las reglas de Firestore. Si Firebase CLI indica que el proyecto no está en Blaze, habrá que revisar el plan y los costes antes de habilitar facturación.

## Frontend

En una copia limpia del proyecto (no reutilizar `node_modules` extraídos de Windows en Linux ni al revés):

```powershell
npm install
npm run build
```

El ZIP recibido contiene `node_modules` preparado para otro entorno, por lo que en este entorno no se ha podido ejecutar Vite. Se ha comprobado el análisis sintáctico de todos los archivos JS/JSX y `node --check` de Cloud Functions, pero eso no sustituye una compilación real ni pruebas con Firebase.

## Decisiones y límites pendientes de prueba

- Los editores de Noticias/Recursos y el carrusel aceptan URL de imágenes y subida local. La subida requiere integrar primero `STORAGE_RULES_REQUIRED.md`.
- Los controles de pausa pertenecen al reproductor iframe de YouTube. No se ha manipulado el interior del iframe, porque es contenido externo y no se puede ocultar su overlay desde CSS de ToonKnight sin reemplazar el reproductor.
- El archivo `FIRESTORE_RULES_REQUIRED.md` es una guía de integración, no reglas completas listas para publicar.
- La eliminación de cuenta se ejecuta solo al invocar la función desde el perfil público y requiere confirmación. No se ha ejecutado ninguna eliminación real.
- No se ha escrito en la base de datos real ni se ha desplegado nada.
