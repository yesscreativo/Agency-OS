# Seguridad

## Objetivo

Documentar el modelo de seguridad de Agency OS y qué partes ya están implementadas, auditadas y verificadas en el proyecto real (`hicbkpwywwhnhiawulmu`), para que un futuro QA no repita trabajo ya cerrado ni asuma protegido algo que no lo está.

## Funcionalidades

- Supabase Auth
- RBAC (roles, permisos, matriz `role_permissions`)
- Permisos directos
- Bypass `is_super`: un rol con `roles.is_super = true` (ej. "Administrador") pasa TODOS los chequeos de permiso, tanto en la app (`hasPermission()` en `apps/web/lib/auth.ts`) como en las funciones de base de datos que lo implementan explícitamente (`current_user_is_super()`). **Regla para código nuevo:** cualquier función/trigger nuevo que reemplace un chequeo de permiso en DB debe incluir `current_user_is_super() or ...`, o un usuario `is_super` quedará bloqueado por algo que la app le muestra como permitido (bug real encontrado y corregido 2026-09-29, ver abajo).
- MFA (V2)
- Audit Engine
- Soft Delete
- Logs

## Protección de costo/margen en cotizaciones (cerrado y auditado, 2026-09-14 a 2026-09-29)

Los campos `cost_price`/`client_price` (y sus equivalentes en JSONB) están protegidos por columna, no solo por fila — un usuario sin el permiso `quote.see_costs`/`quote.see_client_price` no puede leerlos ni escribirlos ni por REST directo, aunque tenga acceso a la fila por RLS de organización.

**Tablas/mecanismos cubiertos:**
- `quote_items` — vía la función `get_quote_items_secure()` (enmascara en lectura) + el trigger `guard_quote_item_price_permissions` (bloquea escritura no autorizada). Columna revocada de `anon`/`authenticated`, solo alcanzable por la RPC o por `service_role`.
- `supplier_orders.items`/`.token` — columnas revocadas de `anon`/`authenticated`; la app lee/escribe con `service_role` y enmascara el `token` en el servidor según `access.canSendSupplierOrder` antes de mandarlo al client component.
- `quote_versions.snapshot` — columna revocada de `anon`/`authenticated`; la app lee/escribe con `service_role`.
- El chequeo de permiso de las dos funciones de `quote_items` usa `current_user_has_permission_in_org(perm_code, organization_id)` (no el helper global sin scope) + el bypass `current_user_is_super()`.

**QA verificado en navegador por Yesid (2026-09-29), todo OK:**
- Cotización nueva: ítems y precios se ven correctamente según el rol (costo vs. precio cliente vs. margen).
- Envío al cliente + respuesta del cliente por ítem (aceptar/pedir cambios/rechazar) end-to-end, con notificación en plataforma.
- Envío de orden de compra a proveedor, confirmación de recepción por el proveedor (`/proveedor/<token>`), y visualización de "Confirmó recepción" + descarga de la orden — end-to-end.
- Guardar borrador / autosave / enviar cotización con una cuenta `is_super` (antes rota, ver bug de abajo).

**Bug real encontrado y corregido en esa misma sesión de QA:** una cuenta `is_super` (Administrador) no podía guardar ni enviar cotizaciones, y veía el margen en -100%, porque `get_quote_items_secure`/`guard_quote_item_price_permissions` no tenían el bypass de `is_super` que sí tiene la app — la app pensaba que sí podía ver/editar el precio cliente y no activaba la protección de "preservar el valor real al guardar", pero la base de datos rechazaba el cambio. Corregido agregando `current_user_is_super()` a ambas funciones (migración `053_fix_quote_items_super_bypass.sql`).

## Cierres posteriores al QA del 2026-09-29

- **Cotización aceptada/cerrada ya no se puede editar:** se bloquea tanto en UI (`quote-form.tsx`: `canEdit` ahora es `false` si `status` es `accepted` o `closed`, además del permiso `quote.update`) como en el servidor (`saveQuoteDraft` en `quote-actions.ts` rechaza el guardado completo con ese mismo criterio, leyendo el status real vía `service_role` — no depende de la UI). `sent` y `rejected` siguen editables a propósito (permite corregir antes de que el cliente responda, o tras un rechazo). El label "Editar"/"Ver" de la lista (`crm/page.tsx`) también quedó consistente con esto.
- **Enlace de respuesta del cliente se renueva al reenviar:** `sendQuote` ahora llama `renewQuoteRecipientLinks` (nueva función en `quote-recipients.ts`) en cada envío/reenvío, empujando `expires_at` a `CLIENT_TOKEN_EXPIRY_DAYS` (5 días) hacia adelante — mismo patrón que `supplier_orders`. Conserva token/`viewed_at`/comentario; antes, reenviar una cotización con un destinatario de más de 5 días mandaba un enlace ya vencido.

## Pendiente (encontrado en QA, no corregido todavía)

- **Color de notificación según estado:** pedido de UX, no bloqueante — la notificación de "cliente respondió" no refleja visualmente si fue aceptado/rechazado/con cambios.

## Reglas

- Ningún dato de costo/margen debe ser legible por un rol sin `quote.see_costs`/`quote.see_client_price`, ni por UI ni por REST directo.
- Toda función/trigger de base de datos que reemplace un chequeo de permiso de la app debe replicar el bypass `is_super` de la app, o documentar explícitamente por qué no aplica.
- Los helpers scoped por organización (`current_user_has_permission_in_org`) se usan para código nuevo; el helper global (`current_user_has_permission`, sin scope) sigue en uso en policies viejas y se difiere su migración hasta que exista una 2ª organización real.
