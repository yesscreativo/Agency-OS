# Tablas

Core:
- organizations
- areas
- subareas
- teams
- people
- users

Business:
- clients
- contracts
- services

Operation:
- work_items
- comments
- attachments
- checklists
- time_entries

Platform:
- notifications
- events
- approvals

## Implementado (Supabase, proyecto `agency-os` / `hicbkpwywwhnhiawulmu`, 2026-07-14)

Primer módulo de código: CRM/Cotizaciones (migración del cotizador). Solo se crearon las
tablas necesarias para este módulo, no el modelo completo de arriba (`areas`, `subareas`,
`teams`, `contracts`, `services`, `work_items`, etc. siguen sin implementar).

**Core (subconjunto mínimo):**
- `organizations` — tenant de la agencia (Core de la spec). **No** es la empresa del cliente
  (esa era la ambigüedad del cotizador viejo, ver nota abajo).
- `people` — identidad de cualquier persona (interna o de cliente), con o sin login.
- `users` — extiende `auth.users` 1:1, vía `person_id`.
- `roles`, `permissions`, `role_permissions`, `user_roles` (asignación acotada a `organization_id`).

**CRM/Cotizaciones:**
- `clients` — empresa cliente. Fusiona los campos `nit`/`responsible` que en el esquema viejo
  vivían en una tabla `organizations` separada (esa tabla vieja en realidad describía la
  empresa del cliente, no el tenant — de ahí el choque de nombres, ver Relationships.md).
- `quotes`, `quote_items`, `quote_recipients` (magic link cliente, expira 5 días),
  `quote_versions`, `supplier_orders` (magic link proveedor, expira 30 días).
- `quote_code_counters` + función `next_quote_seq(client_id, day)` — contador atómico para
  la numeración `MES+CLIENTE+DDMMAAAA-NN`, reemplaza el cálculo en JS del cotizador viejo
  (tenía condición de carrera).

Pendiente: `contacts` (personas de contacto del cliente, distintas de `quote_recipients`) se
evaluó y se dejó fuera por ahora — nada del cotizador actual lo requiere; se agrega si un
flujo futuro lo necesita.
