-- Resolución de slugs de URL (/proyectos/{cliente}/{proyecto}/tareas/{tarea})
-- traía TODO el listado de clientes/proyectos/tareas de la organización y
-- filtraba en JS con matchesShortId (packages/domain/src/slug.ts) porque
-- PostgREST no puede filtrar por prefijo sobre una columna uuid. `shortId(id)`
-- es exactamente los primeros 8 caracteres del uuid en texto (el primer guión
-- del formato 8-4-4-4-12 cae justo después), así que una columna generada +
-- índice permite resolver con una query real. Ver deuda técnica documentada
-- 2026-09-04 (pendientes-proyectos), item de performance #2.
alter table public.clients
  add column short_id text generated always as (substring(id::text, 1, 8)) stored;
create index clients_short_id_idx on public.clients (short_id);

alter table public.work_items
  add column short_id text generated always as (substring(id::text, 1, 8)) stored;
create index work_items_short_id_idx on public.work_items (short_id);
