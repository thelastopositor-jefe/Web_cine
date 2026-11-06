# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.

## Cambios de esta versión de ToonKnight

- El carrusel adapta la vista móvil: la imagen conserva su proporción y el texto pasa debajo para evitar que el contenido tape la ilustración.
- Los proyectos admiten un enlace de campaña de Kickstarter u otra plataforma de crowdfunding; se pueden filtrar por «Crowdfunding / Kickstarter» y el detalle incluye un botón a la campaña.
- El botón «Denunciar» aparece dentro de la ventana de detalle del proyecto, no sobre la miniatura. El envío utiliza la colección Firestore `reports`; revisa y configura las reglas de seguridad antes de desplegar.
- Se añaden borradores de aviso legal, privacidad, cookies, condiciones de uso y transparencia comercial en los enlaces del pie de página.
- Se usa el dominio `toonknight.com` en los metadatos del documento.

Consulta `LEGAL_AND_DEPLOYMENT_CHECKLIST.md` antes de publicar. Los textos legales son borradores con campos pendientes, y el gestor de consentimiento de cookies y las reglas de Firestore para denuncias no están implementados en esta entrega.


## Documentación legal

Consulta la carpeta `LEGAL/` para los borradores personalizados y `LEGAL/PENDIENTES_ANTES_DE_PUBLICAR.md` para la lista de verificaciones. No publiques los textos como definitivos hasta completar los campos pendientes y auditar la configuración real.
