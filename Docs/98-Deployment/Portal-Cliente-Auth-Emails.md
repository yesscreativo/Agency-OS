# Portal Cliente — despliegue de Auth y emails

## Objetivo

Checklist para pasar a producción el login del Portal Cliente y el Send Email
Hook de Supabase que entrega invitaciones y recuperaciones a n8n/Gmail.

## Estado local de referencia

- `Site URL` de Supabase: `http://localhost:3000`.
- Redirect URLs de Supabase: agregar `http://localhost:3000/**` durante QA local.
- Workflow n8n: `Supabase Auth - Invitación y recuperación`.
- Webhook n8n: `POST /webhook/supabase_send_email`.
- La ruta `/auth/confirm` debe responder y redirigir los enlaces inválidos a
  `/login?error=enlace-invalido` o `/portal/login?error=enlace-invalido`.

## Checklist antes de producción

### Aplicación

- [ ] Definir el dominio público definitivo de Agency OS, siempre con HTTPS.
- [ ] Configurar `NEXT_PUBLIC_SITE_URL=https://DOMINIO-PRODUCCION` en la app.
- [ ] Desplegar la ruta `/auth/confirm` y verificar que no devuelve 404.
- [ ] Desplegar `/auth/callback/finish` y las pantallas `/portal/activar`,
  `/portal/login` y `/portal/recuperar`.
- [ ] Aplicar la migración `065_client_contacts_updated_at.sql`.

### Supabase Authentication → URL Configuration

- [ ] Cambiar `Site URL` de `http://localhost:3000` a
  `https://DOMINIO-PRODUCCION`.
- [ ] Agregar `https://DOMINIO-PRODUCCION/auth/callback` a Redirect URLs.
- [ ] Agregar `https://DOMINIO-PRODUCCION/**` solamente si otros flujos de Auth
  requieren rutas adicionales y se acepta ese alcance.
- [ ] Quitar las URLs de localhost del proyecto de producción cuando termine
  el QA, salvo que exista una necesidad explícita de desarrollo contra ese
  mismo proyecto.

El `Site URL` de Supabase también debe apuntar al dominio público antes de
enviar emails reales. El workflow usa `AGENCY_OS_PUBLIC_URL` como origen
preferido y deja `email_data.site_url` como respaldo.

### n8n / Easypanel

- [ ] Mantener `NODE_FUNCTION_ALLOW_BUILTIN=crypto`.
- [ ] Mantener `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` mientras el workflow lea el
  secret mediante `$env`.
- [ ] Mantener `SUPABASE_SEND_EMAIL_HOOK_SECRET` fuera del repositorio.
- [ ] Cambiar `AGENCY_OS_PUBLIC_URL` de `http://localhost:3000` a
  `https://DOMINIO-PRODUCCION` y reiniciar el servicio de n8n.
- [ ] Confirmar que el workflow esté publicado y el nodo Gmail tenga la
  credencial de Laburu.
- [ ] Confirmar que el Webhook tenga `Raw Body` activado.
- [ ] Confirmar que la Production URL use HTTPS y termine en
  `/webhook/supabase_send_email`.

### Supabase Authentication → Auth Hooks

- [ ] Confirmar que el Send Email Hook apunte a la Production URL de n8n.
- [ ] Confirmar que el secret del hook coincida con la variable de Easypanel.
- [ ] Activar el hook únicamente cuando n8n esté publicado y saludable.

## QA de producción

- [ ] Una petición sin firma al webhook responde `401` y no ejecuta Gmail.
- [ ] Recuperación de un contacto externo llega a `/portal/activar`.
- [ ] Recuperación de un colaborador interno llega a `/update-password`.
- [ ] Una invitación nueva llega a `/portal/activar` y permite definir clave.
- [ ] El login cruzado interno/portal rechaza la cuenta con el mensaje correcto.
- [ ] Deshabilitar un contacto invalida su acceso y reactivarlo lo restaura.
- [ ] Las ejecuciones completas del Auth Hook terminan en menos de cinco
  segundos.

## Rollback

Si el envío falla en producción:

1. Desactivar el Send Email Hook en Supabase.
2. Confirmar que Supabase vuelve al proveedor built-in o al SMTP configurado.
3. Revisar en n8n la última ejecución de `supabase_send_email`.
4. No cambiar ni publicar un secret en logs, capturas, documentación o Git.
