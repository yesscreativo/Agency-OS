# Migraciones — CRM/Cotizaciones

Aplicadas al proyecto Supabase `agency-os` (`hicbkpwywwhnhiawulmu`, org laburuagencia,
us-west-1). El proyecto de producción del cotizador viejo (`oiixyyvhqqmcaioamolj`) no se toca.

## Mapeo esquema viejo → nuevo

- `internal_users` → `users` + `user_roles`. Roles: `super_admin` → Administrador,
  `creator` → KAM, `viewer` → Colaborador/Director (a decidir caso por caso en el ETL).
- La vieja `organizations` (con `nit`/`responsible`) describía la **empresa del cliente**, no
  el tenant → se fusionó en `clients.nit` / `clients.responsible`. La nueva `organizations` es
  el tenant de la agencia (Core de la spec), hoy con una sola fila placeholder ("Laburu").
- `kams_pms` → no se migra como tabla; un KAM/PM es un `user` con rol `kam`/`pm` en
  `user_roles`.
- Todas las tablas de negocio ganan `organization_id` (multi-tenant) y RLS por organización.
- La numeración `MES+CLIENTE+DDMMAAAA-NN` deja de calcularse en JS (condición de carrera) y
  usa `next_quote_seq()` + `quote_code_counters` (contador atómico en BD).
- `quote_recipients.expires_at` pasa de 72h a **5 días** (regla explícita del negocio, no del
  esquema viejo). `supplier_orders.expires_at` se mantiene en 30 días.

## Pendiente para el ETL (Fase 8 del plan)

- Importar `clients`, `quotes`, `quote_items`, `quote_recipients`, `quote_versions`,
  `supplier_orders` desde el backup `Agency OS/backups/prod-oiixyyvhqqmcaioamolj-20260710/`.
- Crear las filas `people`/`users`/`user_roles` para cada `internal_users` real, resolviendo
  el mapeo de roles caso por caso.
- Decidir `organization_id` de cada `client`/`quote` migrado (hoy solo existe la org
  placeholder "Laburu").

## Pendiente de diseño (no resuelto en el esquema)

- `quote.see_costs` es un permiso a nivel de columna (ocultar `cost_price`/margen); RLS es a
  nivel de fila. Se necesitará una vista sin esas columnas o filtrado server-side.
- Acceso público por token (`quote_recipients`, `supplier_orders`): sin policy anónima a
  propósito — se resuelve vía API Routes de `apps/web` con `service_role`, nunca con la
  `anon` key expuesta al cliente.
