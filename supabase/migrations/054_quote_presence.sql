-- Presencia en tiempo real (con retraso de ~12s, por polling) de quién más
-- tiene abierta una cotización ahora mismo — pedido de Yesid tras la sesión de
-- QA de concurrencia (ver Docs/40-Technical/Security.md). Una fila por
-- (quote_id, user_id); el cliente hace upsert de su propia fila cada ~12s
-- mientras tiene el formulario abierto (ver syncQuotePresence en
-- apps/web/lib/quote-presence-actions.ts). Sin fila = nadie sabe que no está:
-- no hace falta borrar al cerrar la pestaña, la fila expira sola (ver cron
-- de limpieza abajo) — no hay evento de cierre confiable en todos los
-- navegadores.

create table public.quote_presence (
  quote_id uuid not null references public.quotes(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  last_seen_at timestamptz not null default now(),
  primary key (quote_id, user_id)
);

create index idx_quote_presence_quote_id on public.quote_presence(quote_id);

alter table public.quote_presence enable row level security;

-- Lectura: cualquier miembro de la organización ve quién está en una
-- cotización de su propia org (mismo patrón que el resto de las tablas).
create policy quote_presence_select on public.quote_presence
  for select using (organization_id in (select public.current_user_organization_ids()));

-- Escritura: cada quien solo puede tocar SU PROPIA fila de presencia.
create policy quote_presence_insert on public.quote_presence
  for insert with check (
    user_id = auth.uid()
    and organization_id in (select public.current_user_organization_ids())
  );

create policy quote_presence_update on public.quote_presence
  for update using (user_id = auth.uid());

create policy quote_presence_delete on public.quote_presence
  for delete using (user_id = auth.uid());

-- Limpieza: sin esto la tabla crece para siempre (una fila por cada
-- combinación de usuario+cotización que alguna vez se abrió). Corre cada hora
-- y borra lo que lleve más de 1 hora sin actualizarse — muy por encima del
-- intervalo de ping real (~12s) o de la ventana de "sigue aquí" (~25s) que usa
-- la lectura, así que nunca borra una presencia todavía vigente.
create extension if not exists pg_cron;

select cron.unschedule('purge-quote-presence')
from cron.job
where jobname = 'purge-quote-presence';

select cron.schedule(
  'purge-quote-presence',
  '0 * * * *',
  $$ delete from public.quote_presence where last_seen_at < now() - interval '1 hour'; $$
);
