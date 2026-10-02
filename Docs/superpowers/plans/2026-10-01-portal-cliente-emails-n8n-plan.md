# Portal Cliente — emails de auth por n8n + QA completado

> Continuación de `Docs/superpowers/specs/2026-10-01-portal-cliente-design.md` y
> `Docs/superpowers/plans/2026-10-01-portal-cliente-plan.md` (9/9 tareas
> implementadas en la rama `Feat/portal-cliente`, sin PR todavía). Este
> documento cubre lo que quedó pendiente de esa sesión: reemplazar el envío
> de emails de Supabase Auth por un flujo n8n, y terminar el QA manual.

## Estado de ejecución — 2026-10-02

- **Tarea A implementada y validada:** existe `/auth/confirm`, valida
  `token_hash`/`type`, establece la sesión con `verifyOtp` y conserva el gate
  de identidad de `/auth/callback/finish`.
- **Tarea B configurada y validada en n8n:**
  `n8n/workflows/supabase-auth-emails.json` cubre `invite` y `recovery`,
  verifica la firma Standard Webhooks sobre el body crudo, rechaza replay por
  timestamp, evita duplicados por `webhook-id` y envía mediante Gmail. El
  workflow fue publicado con Gmail, el hook HTTPS de Supabase quedó activo y
  ambas clases de email llegaron correctamente.
- **Tarea C completada:** se validaron recuperación, invitación, activación,
  separación de login interno/portal, deshabilitación y reactivación.
- Revisión adicional aplicada: rollback de `auth.users` si falla la creación
  de `client_contacts`, mensaje visible para enlaces inválidos y trigger de
  `updated_at` en la migración `065_client_contacts_updated_at.sql`.
- Ajuste visual validado: el panel Portal quedó en la columna lateral, encima
  de Zona peligro, para no extender la ficha debajo del historial.

## Contexto

Portal Cliente usa `auth.admin.inviteUserByEmail` (invitar contacto) y
`auth.resetPasswordForEmail` (recuperar contraseña) — ambos disparan un
email que hoy manda el **servicio de email built-in de Supabase**, limitado
a **2 emails/hora por proyecto** (confirmado en el Dashboard del proyecto,
Authentication → Rate Limits — el campo queda bloqueado para subirlo salvo
que se configure SMTP propio o un Auth Hook). Ese límite es inviable ni para
QA, mucho menos para invitar clientes reales.

Decisión de Yesid (2026-10-01): en vez de conectar un proveedor SMTP nuevo
(Resend/Postmark/SES), reusar el **Gmail ya configurado en n8n** — los
flujos `quote_sent` y `supplier_order` del cotizador CRM ya envían correo
por un nodo Gmail con credencial propia (ver capturas de esos flujos: nodo
"Webhook" → "Armar correo" → "Send a message" de Gmail). La misma
credencial sirve para esto.

## Mecanismo: Supabase Auth Hook "Send Email"

Supabase permite reemplazar el envío de CUALQUIER email de auth (invite,
recovery, magic link, confirm signup, email change) por un webhook propio:
**Authentication → Hooks → "Send Email hook"**. Cuando está activo, Supabase
deja de mandar el email él mismo: en su lugar hace un `POST` firmado a la
URL que le des, con el payload necesario para armar el email, y espera un
`200 OK`. Esto saca el envío por completo del servicio built-in (el límite
de 2/hora deja de aplicar) y nunca pasa por "cuántos emails deja mandar
Supabase" — el límite pasa a ser el de la cuenta de Gmail (muy por encima
de lo que este volumen necesita).

Payload aproximado que manda Supabase (confirmar el shape exacto contra la
documentación vigente de Supabase — "Auth Hooks → Send Email Hook" — al
implementar, puede haber cambiado):

```json
{
  "user": { "id": "...", "email": "widmark90@hotmail.com", ... },
  "email_data": {
    "token": "123456",
    "token_hash": "pkce_...",
    "redirect_to": "https://.../auth/callback?next=/portal/activar",
    "email_action_type": "invite",
    "site_url": "https://...",
    "token_new": "",
    "token_hash_new": ""
  }
}
```

`email_action_type` es el dato clave para elegir plantilla: `"invite"` o
`"recovery"` son los dos que usa este proyecto hoy (Portal Cliente e
internos comparten el mismo flujo de Supabase Auth).

**Seguridad — no saltear esto:** Supabase firma el payload (header tipo
`webhook-signature`, formato Standard Webhooks / HMAC con el secret que se
genera al activar el hook). El workflow de n8n TIENE que verificar esa
firma antes de mandar nada — si no, cualquiera que descubra la URL del
webhook puede hacer que el Gmail de Laburu mande "invitaciones" arbitrarias
a cualquier email (abuso de spam/phishing desde una cuenta real de la
agencia). Confirmar en la documentación de Supabase el algoritmo y el
nombre exacto del header vigente.

## Tarea A — Ruta propia `/auth/confirm` (evita el bug de fragmento de raíz)

Contexto del bug ya encontrado y parchado en esta rama (ver commit
`fix(auth): /auth/callback maneja sesión entregada por fragmento de URL`):
el `/verify` hosteado de Supabase entrega la sesión como fragmento de URL
(`#access_token=...`), que un servidor nunca puede leer — se resolvió con
un puente cliente en `apps/web/app/auth/callback/page.tsx`. Ese parche sigue
siendo necesario para Google OAuth (que sí llega por `?code=`) y como
fallback, pero construyendo el link nosotros mismos (porque ahora lo arma
n8n, no el Dashboard de Supabase) se puede evitar el problema de raíz:

- **Crear** `apps/web/app/auth/confirm/route.ts` (Route Handler, server-side):
  recibe `token_hash` y `type` por query string, llama
  `supabase.auth.verifyOtp({ token_hash, type })` (del lado del servidor,
  con `getSupabaseServerClient()` de `apps/web/lib/supabase-server.ts`) —
  esto establece la sesión vía cookie directamente, sin fragmento de por
  medio — y redirige a `/auth/callback/finish?next=...` (el mismo gate de
  identidad que ya existe, sin cambios).
- El link que arma el workflow de n8n para el botón del email apunta a
  `{{ site_url }}/auth/confirm?token_hash={{ email_data.token_hash }}&type={{ email_data.email_action_type }}&next={{ email_data.redirect_to con solo el path, ej. /portal/activar }}`
  en vez de al `ConfirmationURL`/`/verify` de Supabase.

## Tarea B — Workflow de n8n

Mismo patrón que `quote_sent`/`supplier_order` (ver flujos existentes en
n8n para el nodo Gmail y la credencial ya configurada):

1. **Webhook** (`POST`, path sugerido: `supabase_send_email`) — recibe el
   payload del Send Email Hook.
2. **Verificar firma** — nodo Code/Function que valida el header de firma
   contra el secret del hook (guardado como variable/credencial en n8n, NO
   hardcodeado en el nodo). Si no valida, cortar el flujo y responder error
   (4xx) sin enviar nada.
3. **Elegir plantilla según `email_data.email_action_type`** (`invite` vs
   `recovery`) — reusar el HTML/copy ya escrito en
   `supabase/email-templates/invite.html` y `recovery.html` (marca Laburu,
   ya con el estilo aprobado), adaptado a sintaxis de expresión de n8n en
   vez de `{{ .ConfirmationURL }}`/`{{ .Email }}` de Supabase. El link del
   botón apunta a la ruta `/auth/confirm` de la Tarea A, no al
   `ConfirmationURL` del payload.
4. **Armar correo** (nodo Code, como ya hacen `quote_sent`/`supplier_order`
   en "Armar correo quote"/"Armar correo supplier").
5. **Send a message** (Gmail, misma credencial SMTP ya asignada en los
   otros dos flujos).
6. Responder `200` al webhook de Supabase.

**Antes de activar** (mismo formato que ya usan los otros flujos en su
documentación dentro de n8n):
1. Asignar la credencial Gmail ya usada en `quote_sent`/`supplier_order`.
2. Confirmar/guardar el secret de verificación de firma del hook.
3. Activar el "Send Email hook" en el Dashboard de Supabase
   (Authentication → Hooks) apuntando al path de este webhook.
4. Probar primero con el flujo de "recuperar contraseña" (menor impacto que
   invitar) antes de dar de baja el envío built-in.

## Tarea C — Terminar el checklist de QA pendiente

Contacto de prueba ya existe: `widmark90@hotmail.com` ("Cliente WID"),
`client_contacts.status = 'invited'`, su invitación original ya fue
consumida por Supabase (no reusar ese link — usar "olvidé mi contraseña").

1. En `/portal/login` → "¿Olvidaste tu contraseña?" con
   `widmark90@hotmail.com` → confirmar que ahora sí llega a
   `/portal/activar` y deja poner contraseña (valida el fix del fragmento
   de `/auth/callback`; si ya se implementó `/auth/confirm` de la Tarea A,
   validar esa ruta en su lugar).
2. Con ese email/contraseña, intentar entrar en `/login` (interno) →
   confirmar que lo rechaza con el mensaje de "cuenta de portal de
   cliente — ingresa por /portal/login".
3. Con el email/contraseña de un colaborador interno real, intentar entrar
   en `/portal/login` → confirmar que lo rechaza con el mensaje de "cuenta
   de uso interno — ingresa por /login".
4. Deshabilitar el contacto desde `/crm/clientes/[id]` → ya no puede entrar
   a `/portal/login`, y si tenía sesión abierta, al recargar `/portal` lo
   saca.
5. Reactivar el contacto → vuelve a poder entrar normalmente.

### Resultado del QA — 2026-10-02

- Recuperación de contraseña: aprobada; el email llegó y permitió definir la
  nueva contraseña y entrar a `/portal`.
- Login cruzado: aprobado en ambas direcciones con los mensajes esperados.
- Deshabilitar/reactivar: aprobado; el acceso se bloqueó y luego se restauró.
- Invitación de contacto nuevo: aprobada; llegó el email, el enlace permitió
  definir contraseña, entrar al portal y el contacto cambió a `active`.
- Ejecución n8n: aprobada por la rama completa hasta Gmail y respuesta 200.

## Al terminar

A+B+C están validados. Queda aplicar la migración pendiente en el entorno de
destino, desplegar la aplicación, cambiar las URLs de localhost por el dominio
HTTPS siguiendo `Docs/98-Deployment/Portal-Cliente-Auth-Emails.md`, crear los
commit(s) y decidir con Yesid si se abre PR de `Feat/portal-cliente` hacia
`main` o se continúa encima con Tickets.
