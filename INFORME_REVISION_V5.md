# TuRodaje — revisión v5: aislamiento de sesión local

## Cambio realizado
En `src/App.jsx` se sustituye el almacenamiento de sesión `onlytoon_user` / `onlytoons_user` por `turodaje_user`. No se importan sesiones de ToonKnight. El usuario deberá iniciar sesión de nuevo en TuRodaje si existía una sesión anterior guardada.

## Verificaciones estáticas
- La versión original del ZIP contiene 7 referencias a `onlytoon_user` y 3 a `onlytoons_user`.
- El archivo actualizado ya no contiene esas claves.
- Se mantiene intacto el resto del código y no se modifican Cloud Functions ni las reglas de Firestore.

## Instalación cuando se autorice
1. Hacer copia de seguridad de `src/App.jsx`.
2. Sustituir únicamente `src/App.jsx` por el del paquete.
3. Ejecutar `npm run build` y comprobar el inicio/cierre de sesión en el entorno local.

## Pendiente
- Verificar en navegador y Firebase Emulator el flujo de autenticación, las reglas y los comentarios.
- No desplegar Firestore ni Functions hasta superar esas pruebas.

Esta revisión no toca ToonKnight ni ejecuta despliegues.
