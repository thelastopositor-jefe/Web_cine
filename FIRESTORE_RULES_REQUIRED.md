# Reglas de Firestore necesarias para la nueva arquitectura

**No publicar este documento directamente como reglas completas.** El ZIP recibido no contiene las reglas actuales del proyecto Firebase. Estas reglas deben integrarse con las reglas existentes, conservando el acceso que ya necesita el catálogo, los perfiles, productos, cursos, empleo y foro.

Las operaciones sensibles nuevas se ejecutan mediante Cloud Functions con Admin SDK. Por ello, los clientes no deben poder escribir directamente mensajes, conversaciones, notificaciones, denuncias, avisos generales ni registros de moderación.

Añadir estas funciones dentro del bloque `service cloud.firestore`:

```text
function signedIn() {
  return request.auth != null;
}

function isModerator() {
  return signedIn()
    && request.auth.token.email in ['roman82ap@gmail.com', 'thelastopositor@gmail.com'];
}
```

Añadir estos `match` dentro de `match /databases/{database}/documents`:

```text
match /projects/{projectId} {
  allow read: if isModerator()
    || resource.data.status == 'approved'
    || (signedIn() && resource.data.creatorId == request.auth.uid)
    || (signedIn() && resource.data.creatorEmail == request.auth.token.email); // compatibilidad con proyectos antiguos.

  allow create: if signedIn()
    && request.resource.data.creatorId == request.auth.uid
    && request.resource.data.status == 'pending'
    && request.resource.data.get('creatorProfileId', null) in [null, request.auth.uid]
    && request.resource.data.get('likesCount', 0) == 0
    && request.resource.data.get('isFeatured', false) == false
    && !('creatorPatreonSupporter' in request.resource.data)
    && request.resource.data.createdAt is timestamp;

  allow update: if isModerator() || (signedIn()
    && resource.data.creatorId == request.auth.uid
    && request.resource.data.creatorId == resource.data.creatorId
    && request.resource.data.get('creatorEmail', null) == resource.data.get('creatorEmail', null)
    && request.resource.data.get('creatorProfileId', null) in [null, request.auth.uid]
    && request.resource.data.status == resource.data.status
    && request.resource.data.get('likesCount', 0) == resource.data.get('likesCount', 0)
    && request.resource.data.get('isFeatured', false) == resource.data.get('isFeatured', false)
    && request.resource.data.get('creatorPatreonSupporter', false) == resource.data.get('creatorPatreonSupporter', false)
    && request.resource.data.get('createdAt', null) == resource.data.get('createdAt', null)
    && request.resource.data.get('moderatedBy', null) == resource.data.get('moderatedBy', null)
    && request.resource.data.get('moderatedAt', null) == resource.data.get('moderatedAt', null)
    && request.resource.data.get('rejectionReason', '') == resource.data.get('rejectionReason', '')
    && request.resource.data.get('viewsCount', 0) == resource.data.get('viewsCount', 0)
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      'title', 'creator', 'creatorName', 'creatorProfileId', 'creatorPhoto', 'creatorBio',
      'creatorPatreon', 'creatorKofi', 'creatorWeb', 'description', 'year', 'youtubeId',
      'thumbnail', 'type', 'format', 'genre', 'genres', 'duration', 'patreonUrl',
      'campaignUrl', 'seasons', 'updatedAt'
    ]));

  allow delete: if isModerator() || (signedIn() && resource.data.creatorId == request.auth.uid);

  match /likes/{uid} {
    allow read: if signedIn() && request.auth.uid == uid;
    allow create, update, delete: if false; // likeProject usa Admin SDK y controla la unicidad.
  }
  match /views/{viewId} {
    allow read, write: if false; // recordProjectView y la limpieza programada usan Admin SDK.
  }
}

match /conversations/{conversationId} {
  allow read: if isModerator() || (signedIn() && request.auth.uid in resource.data.participants);
  allow create, update, delete: if false; // sendDirectMessage es el único escritor.

  match /messages/{messageId} {
    allow read: if isModerator() || (signedIn()
      && request.auth.uid in get(/databases/$(database)/documents/conversations/$(conversationId)).data.participants);
    allow create, update, delete: if false;
  }
}

match /users/{uid}/notifications/{notificationId} {
  allow read: if signedIn() && request.auth.uid == uid;
  allow create, update, delete: if false; // distribución y lectura gestionadas por Functions.
}

match /users/{uid} {
  allow read: if isModerator() || (signedIn() && request.auth.uid == uid);
  allow create: if isModerator() || (signedIn() && request.auth.uid == uid
    && request.resource.data.id == uid
    && request.resource.data.email == request.auth.token.email
    && request.resource.data.get('role', 'user') == 'user'
    && request.resource.data.get('isPatreonSupporter', false) == false
    && request.resource.data.keys().hasOnly([
      'id', 'name', 'email', 'photo', 'photoPath', 'banner', 'bannerPath', 'bio',
      'patreonUrl', 'kofiUrl', 'websiteUrl', 'youtubeUrl', 'instagramUrl', 'tiktokUrl',
      'artstationUrl', 'xUrl', 'contactEmail', 'favorites', 'isPatreonSupporter', 'role', 'createdAt'
    ]));
  allow update: if isModerator() || (signedIn() && request.auth.uid == uid
    && request.resource.data.email == resource.data.email
    && request.resource.data.get('role', 'user') == resource.data.get('role', 'user')
    && request.resource.data.get('isPatreonSupporter', false) == resource.data.get('isPatreonSupporter', false)
    && request.resource.data.diff(resource.data).affectedKeys().hasOnly([
      'name', 'photo', 'photoPath', 'banner', 'bannerPath', 'bio', 'patreonUrl', 'kofiUrl',
      'websiteUrl', 'youtubeUrl', 'instagramUrl', 'tiktokUrl', 'artstationUrl', 'xUrl',
      'contactEmail', 'favorites', 'updatedAt'
    ]));
  allow delete: if false; // deleteUserAccount elimina usuarios con Admin SDK y registra auditoría.

  match /notifications/{notificationId} {
    allow read: if signedIn() && request.auth.uid == uid;
    allow create, update, delete: if false; // Cloud Functions crea y marca notificaciones.
  }
  match /blockedUsers/{targetUid} {
    allow read: if signedIn() && request.auth.uid == uid;
    allow create, update, delete: if false; // setUserBlock usa Admin SDK.
  }
  match /private/{documentId} {
    allow read, write: if false;
  }
}

match /publicProfiles/{uid} {
  allow read: if true;
  allow create: if signedIn() && request.auth.uid == uid
    && request.resource.data.keys().hasOnly(['name', 'nameLower', 'photo', 'photoPath', 'banner', 'bannerPath', 'bio', 'patreonUrl', 'kofiUrl', 'websiteUrl', 'youtubeUrl', 'instagramUrl', 'tiktokUrl', 'artstationUrl', 'xUrl', 'createdAt'])
    && request.resource.data.name is string && request.resource.data.name.size() <= 120;
  allow update: if isModerator()
    || (signedIn() && request.auth.uid == uid
      && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['name', 'nameLower', 'photo', 'photoPath', 'banner', 'bannerPath', 'bio', 'patreonUrl', 'kofiUrl', 'websiteUrl', 'youtubeUrl', 'instagramUrl', 'tiktokUrl', 'artstationUrl', 'xUrl']));
  allow delete: if isModerator();
}

match /users/{uid}/blockedUsers/{targetUid} {
  allow read: if signedIn() && request.auth.uid == uid;
  allow create: if signedIn() && request.auth.uid == uid
    && targetUid != uid
    && request.resource.data.keys().hasOnly(['blockedUid', 'createdAt'])
    && request.resource.data.blockedUid == targetUid;
  allow update: if false;
  allow delete: if signedIn() && request.auth.uid == uid;
}

match /users/{uid}/private/{documentId} {
  allow read, write: if false; // límites anti-spam solo visibles para Functions.
}

match /reports/{reportId} {
  allow read, update, delete: if isModerator();
  allow create: if false; // reportContent valida y crea denuncias desde servidor.
}

match /jobReports/{reportId} {
  allow read, update, delete: if isModerator();
  allow create: if signedIn()
    && request.resource.data.reporterId == request.auth.uid
    && request.resource.data.reason is string
    && request.resource.data.reason.size() > 0
    && request.resource.data.reason.size() <= 1000;
}

match /broadcasts/{broadcastId} {
  allow read: if isModerator();
  allow create, update, delete: if false; // sendBroadcast y su trigger usan Admin SDK.
}

match /moderationAudit/{auditId} {
  allow read: if isModerator();
  allow create, update, delete: if false;
}

match /news/{newsId} {
  allow read: if true;
  allow create, update, delete: if isModerator();
}

match /resources/{resourceId} {
  allow read: if true;
  allow create, update, delete: if isModerator();
}

match /carouselItems/{itemId} {
  allow read: if true;
  allow create, update, delete: if isModerator();
}
```

## Importante antes del despliegue

- Firestore aplica la regla más permisiva que coincida con una ruta; no basta con añadir bloques si ya existe otro `match` demasiado abierto.
- El bloque `/users/{uid}` existente debe seguir protegiendo campos privados como email y contactEmail. Los perfiles públicos deben publicarse en una colección separada sin datos privados.
- Las visitas y los likes se actualizan mediante Cloud Functions; el navegador no puede modificar sus contadores.
- La regla `allow create, update, delete: if false` en likes es intencional: la función `likeProject` usa Admin SDK y evita likes repetidos por UID.
- Las reglas de `projects` existentes deben conservar las actualizaciones que necesita la web, pero impedir que un cliente manipule `likesCount` o campos de moderación. Esto requiere revisar el archivo real publicado.
- Probar con Firebase Emulator Suite antes de desplegar.

### Nota de privacidad sobre proyectos antiguos

Los proyectos nuevos ya no guardan `creatorEmail`; utilizan `creatorId` como referencia privada de propiedad. Sin embargo, algunos proyectos históricos pueden conservar `creatorEmail`. Firestore no permite ocultar un campo concreto mediante reglas: si se permite leer el documento completo a cualquier visitante, ese campo también se entrega. Antes de activar lectura pública por reglas, conviene hacer una exportación y preparar una migración controlada de esos campos históricos. No se ha hecho esa migración automáticamente.

### Índice compuesto requerido

La bandeja de conversaciones consulta `participants` con `array-contains` y ordena por `updatedAt` descendente. Integra el índice de `firestore.indexes.required.json` en el archivo de índices que ya tenga el proyecto; no sustituyas otros índices existentes por este único bloque.
