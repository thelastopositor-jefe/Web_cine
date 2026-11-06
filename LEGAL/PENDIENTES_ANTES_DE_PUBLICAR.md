# ToonKnight — datos y verificaciones pendientes antes del lanzamiento

**Actualizado: 29 de octubre de 2026.** Este documento separa los datos facilitados de los puntos aún no verificados. No debe interpretarse como una certificación de cumplimiento legal.

## 1. Datos facilitados por el titular

- Titular declarado: Roman Arias Pinto, persona física autónoma.
- Marca y dominio: ToonKnight — https://toonknight.com.
- Dirección elegida a nivel de ciudad: Madrid, España. **Falta la dirección postal completa que corresponda publicar.** No inventar una dirección ni usar una dirección comercial sin autorización.
- Correo público y de privacidad: contacto@toonknight.com; el titular indica que ya está operativo.
- Registrador del dominio: Porkbun (https://porkbun.com).
- Hosting: Vercel.
- Autenticación y base de datos: Google Authentication y Firebase/Firestore.
- Formulario de contacto: FormSubmit.
- Idioma: español.
- Público: general.
- Contenido: catálogo/enlaces y reproductor de vídeos alojados en YouTube; no se declara alojamiento propio de los vídeos.
- Funciones: perfiles, favoritos, proyectos, comentarios públicos y denuncias.
- Monetización: enlaces de afiliados de programas distintos de Amazon (nombres pendientes de confirmar); Patreon y cursos propios previstos para el futuro.
- Publicidad en los vídeos: pueden mostrarse anuncios controlados por YouTube. No se ha declarado publicidad propia de ToonKnight.
- No hay actualmente banner de cookies, según el titular.
- El titular no conoce todavía si la aplicación tiene una función de autoeliminación de cuenta.
- Conservación: los plazos siguen siendo una propuesta pendiente de validar y aplicar.
- No se ha declarado una herramienta independiente de analítica. Esto debe comprobarse en el código y en el sitio desplegado.

## 2. Pendientes legales antes de publicar

- [ ] Completar la dirección postal aplicable al aviso legal (calle, número, código postal y localidad). Se ha indicado Madrid, pero no la dirección completa.
- [ ] Revisar si corresponden otros datos de identificación o registro según la situación concreta del titular.
- [ ] Confirmar que contacto@toonknight.com funciona de forma estable y se revisa regularmente.
- [ ] Identificar los programas de afiliados utilizados y revisar sus reglas de divulgación; mostrar una indicación visible junto a cada enlace que genere comisión.
- [ ] No presentar Patreon ni los cursos propios como servicios activos hasta que realmente lo estén.
- [ ] Validar con asesoramiento profesional la dirección y los datos exigibles en el aviso legal si existe duda sobre cómo proteger el domicilio particular.
- [ ] Definir el tratamiento de usuarios menores y las medidas de moderación apropiadas para un sitio dirigido al público general.

## 3. Pendientes técnicos y de privacidad

- [ ] **Formulario:** se ha actualizado el código del proyecto para enviar FormSubmit a contacto@toonknight.com. Confirmar la dirección con FormSubmit si lo exige, enviar una prueba real y verificar entrega, respuestas y carpeta de spam antes del lanzamiento.
- [ ] Revisar las reglas de seguridad de Firestore para cuentas, perfiles, comentarios, proyectos y `reports`; impedir que usuarios lean denuncias ajenas o cambien estados de moderación sin autorización.
- [ ] Verificar si existe un mecanismo de eliminación de cuenta. Si no existe, implementar un procedimiento efectivo de solicitud, borrado o anonimización y documentarlo.
- [ ] Revisar la configuración de Google Authentication y Firebase/Firestore, regiones de datos, accesos administrativos, acuerdos de tratamiento y transferencias internacionales.
- [ ] Revisar el tratamiento de datos de FormSubmit y Vercel.
- [ ] Auditar cookies, `localStorage`, solicitudes de red, miniaturas de YouTube y reproductor en `toonknight.com`.
- [ ] No afirmar que no hay cookies o que solo hay cookies necesarias hasta completar el inventario.
- [ ] Determinar si se necesita un gestor de consentimiento. Si se necesita, implementarlo antes de cargar tecnologías que requieran consentimiento, con aceptar y rechazar igualmente visibles y una forma de cambiar preferencias.
- [ ] Confirmar si existen scripts de analítica, publicidad, seguimiento o integraciones adicionales.
- [ ] Aprobar plazos de conservación y configurar procedimientos de borrado o anonimización. Propuesta aún no validada: contacto hasta 12 meses tras cerrar la consulta; denuncias hasta 24 meses tras resolución; cuentas mientras estén activas y después borrado o anonimización salvo necesidad legal o reclamación. Revisar proporcionalidad y aplicarlo realmente antes de publicar estos plazos.
- [ ] Probar que cada enlace de afiliado se marca individualmente y que la indicación se muestra junto al producto.
- [ ] Preparar procedimiento de reclamaciones de propiedad intelectual, contenido ilegal, moderación y denuncias.
- [ ] Revisar fiscalidad y requisitos aplicables antes de activar monetización o vender cursos propios.
- [ ] Sustituir todos los marcadores entre corchetes y eliminar afirmaciones que no describan el funcionamiento real.
- [ ] Compilar y probar la versión de producción antes de desplegar.

## 4. Fuentes oficiales de referencia

- LSSI, Ley 34/2002, especialmente artículo 10: https://www.boe.es/buscar/act.php?id=BOE-A-2002-13758
- Reglamento General de Protección de Datos (RGPD): https://www.boe.es/doue/2016/119/L00001-00088.pdf
- Guía de cookies de la AEPD: https://www.aepd.es/guias/guia-cookies.pdf

## Nota

Los documentos son borradores de trabajo, no asesoramiento jurídico individual ni una garantía de cumplimiento. La información publicada debe coincidir con el tratamiento real, los proveedores activos y la configuración técnica de la web.
