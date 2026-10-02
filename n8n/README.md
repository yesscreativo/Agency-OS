# Workflows de n8n

## Emails de autenticación de Supabase

Importar `workflows/supabase-auth-emails.json` en n8n. Un único Send Email
Hook de Supabase entrega invitaciones y recuperaciones al mismo endpoint; el
workflow elige la plantilla usando `email_data.email_action_type`.

### Requisitos de la instancia

1. Definir `SUPABASE_SEND_EMAIL_HOOK_SECRET` con el valor completo generado
   por Supabase (`v1,whsec_...`).
2. Permitir el módulo nativo de Node `crypto` en Code nodes:
   `NODE_FUNCTION_ALLOW_BUILTIN=crypto`.
3. Permitir acceso a variables de entorno desde Code nodes. Si la instancia
   usa el bloqueo explícito, configurar `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.
4. Definir `AGENCY_OS_PUBLIC_URL` con el origen público de la aplicación, sin
   ruta ni `/` final. Para QA local: `http://localhost:3000`; en producción:
   `https://DOMINIO-PRODUCCION`.
5. Reiniciar n8n después de cambiar variables de entorno.
6. Importar el JSON y asignar al nodo Gmail la misma credencial usada por los
   workflows `quote_sent` y `supplier_order`.
7. Publicar/activar el workflow y copiar su Production URL.
8. En Supabase: Authentication -> Hooks -> Send Email -> HTTPS, pegar la URL
   de producción y usar el mismo secret configurado en n8n.

El nodo Webhook tiene `Raw Body` activo. Es obligatorio: Standard Webhooks
firma los bytes exactos del request y una serialización posterior del JSON no
produce la misma firma.

El botón del correo usa `AGENCY_OS_PUBLIC_URL` como origen preferido. Esto
evita depender de `URL` dentro del sandbox del Code node y permite cambiar de
localhost al dominio productivo sin editar el workflow.

El primer nodo llamado `Supabase Send Email Hook` es un nodo estándar
**Webhook** de n8n renombrado; no requiere instalar un nodo de Supabase. Si una
importación previa muestra un icono roto, eliminarlo y crear un Webhook normal
con método POST, path `supabase_send_email`, respuesta mediante `Respond to
Webhook` y la opción `Raw Body` activada.

### Pruebas mínimas antes de producción

- Firma inválida: responde 401 y no ejecuta Gmail.
- Payload firmado de `recovery`: manda la plantilla de recuperación.
- Payload firmado de `invite`: manda la plantilla de invitación.
- Un `webhook-id` repetido: responde 200 sin volver a enviar.
- Recuperación interna: el botón llega a `/update-password`.
- Recuperación/invitación de cliente: el botón llega a `/portal/activar`.

Supabase espera que el HTTP Hook termine en aproximadamente cinco segundos.
Revisar la latencia del nodo Gmail en las primeras ejecuciones.
