# RLS

- Organización
- Roles
- Permisos
- Cliente (Portal)
- Líder de área
- RRHH

## Implementado (CRM/Cotizaciones, proyecto `agency-os`, 2026-07-14)

Patrón: todas las tablas con RLS habilitado; alcance por `organization_id` (directo, o vía
`EXISTS` a `quotes` para las tablas hijas). Helpers `SECURITY DEFINER` (bloqueados para `anon`,
solo `authenticated`):
- `current_user_organization_ids()` — organizaciones del usuario autenticado (vía `user_roles`).
- `current_user_has_permission(perm_code)` — chequea permiso vía `user_roles → role_permissions → permissions`.

Catálogos (`roles`, `permissions`, `role_permissions`) son de solo lectura para cualquier
autenticado; escritura solo por `service_role`.

**Pendiente (no resuelto en el esquema, queda para la capa de app):** `quote.see_costs` es un
permiso a nivel de columna (ocultar `cost_price`/margen a KAM), pero RLS es a nivel de fila.
Se necesitará una vista sin columnas de costo o filtrado server-side para roles sin ese permiso.

**Enlaces públicos (`quote_recipients`, `supplier_orders` por token):** no tienen policy de
acceso anónimo por token — se resolverá con rutas server-side (API Routes) usando la
`service_role` key, nunca expuestas al cliente con la `anon` key + filtro por token.
