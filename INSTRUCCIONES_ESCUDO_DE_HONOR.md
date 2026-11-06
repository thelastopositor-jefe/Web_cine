# Escudo de Honor — implementación para ToonKnight

## Archivos incluidos

- `src/App.jsx`: panel de moderación, búsqueda, lista de proyectos activos, activar/desactivar y miniaturas.
- `src/components/PublicProfilePage.jsx`: marco e insignia en portafolios públicos.
- `src/index.css`: marco cobrizo y glow.
- `public/images/escudo-de-honor.webp`: emblema transparente (347 × 360 px, ~46 KB). Puedes reemplazarlo conservando ruta y nombre.
- `functions/index.js`: callable `setProjectHonor` con comprobación de moderación y transacción que garantiza una selección por UID.
- `firestore.rules`: impide que un usuario se conceda `hasHonorFrame` editando o creando proyectos.
- `firebase.json`: incorpora referencia a las reglas Firestore, necesaria para desplegarlas explícitamente.

## Instalación

1. Guarda copia de seguridad de tu proyecto actual.
2. Copia estos archivos sobre las mismas rutas del proyecto. No reemplaces `.env` ni `.firebaserc`.
3. Ejecuta `npm run build` en la raíz del proyecto y comprueba el resultado.
4. Verifica con `firebase use` que estás en el proyecto Firebase correcto.
5. **Antes de usar el botón** despliega el backend y las reglas con:

   `firebase deploy --only "firestore:rules,functions:setProjectHonor,functions:getCreatorProjects"`

   Esto NO despliega otras funciones ni Storage. Revisa las diferencias de reglas con las publicadas antes de ejecutar el comando.
6. Sube los archivos del frontend a GitHub (`git add` selectivo, `git commit`, `git push origin main`) para que Vercel publique la web.
7. Prueba en moderación: activar A, activar B del mismo creador (A se desactiva), desactivar B, y confirmar que otros creadores conservan sus selecciones.

## Importante

- Solo los correos autorizados por `isModerator` en Cloud Functions pueden activar/desactivar.
- Los proyectos deben estar aprobados y tener `creatorId` (UID de la cuenta). Los proyectos importados sin UID no se pueden activar hasta asociarlos correctamente a una cuenta.
- `hasHonorFrame` es distinto de `isFeatured` y de `isPatreonSupporter`. Los destacados y el distintivo de apoyo siguen siendo independientes.
- El cambio de `hasHonorFrame` se sincroniza mediante las suscripciones existentes a Firestore.
- No se implementan comentarios de YouTube.
- No se ha desplegado ni probado contra Firebase real desde este entorno.
- La comprobación de sintaxis JSX y de Cloud Functions ha pasado. No fue posible ejecutar la compilación completa en Linux con las dependencias Windows del ZIP (`@rolldown/binding-linux-x64-gnu` ausente). Debes ejecutar `npm run build` en tu PC antes de publicar.
