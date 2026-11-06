# Reglas de Firebase Storage que deben integrarse

El ZIP recibido no incluía las reglas actuales de Storage. No las sustituyas sin revisar el contenido publicado. Integra este bloque dentro de `service firebase.storage` y conserva las reglas actuales de otros recursos.

```javascript
function signedIn() {
  return request.auth != null;
}

function isModerator() {
  return signedIn() && request.auth.token.email in [
    'admin@toonknight.com',
    'moderador@toonknight.com'
  ];
}

match /profiles/{uid}/{fileName} {
  allow read: if true;
  allow create, update: if request.auth != null
    && request.auth.uid == uid
    && request.resource.size <= 5 * 1024 * 1024
    && request.resource.contentType.matches('image/.*');
  allow delete: if request.auth != null && request.auth.uid == uid;
}

match /moderation/{collectionName}/{contentId}/{fileName} {
  allow read: if collectionName in ['news', 'resources', 'carouselItems'];
  allow create, update: if isModerator()
    && collectionName in ['news', 'resources', 'carouselItems']
    && request.resource.size <= 5 * 1024 * 1024
    && request.resource.contentType.matches('image/.*');
  allow delete: if isModerator()
    && collectionName in ['news', 'resources', 'carouselItems'];
}
```

- Solo moderadores pueden subir, reemplazar o borrar imágenes administradas.
- Las imágenes publicadas se pueden leer públicamente.
- El navegador limita cada imagen a 5 MB; Storage vuelve a comprobar tamaño y tipo MIME.
- Cloud Functions elimina archivos cuando se borra una noticia/recurso/imagen del carrusel o cuando se sustituye una imagen.
- Los usuarios solo pueden subir su propia foto de perfil y banner; no pueden escribir en carpetas de moderación.
- No se ha abierto una ruta pública de subida para mensajes ni para archivos adjuntos.
