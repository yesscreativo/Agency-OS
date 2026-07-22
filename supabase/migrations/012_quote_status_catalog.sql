-- 012_quote_status_catalog.sql
-- Convierte los estados de cotización de un enum Postgres rígido (quote_status)
-- a un CATÁLOGO administrable por organización (crear/renombrar/reordenar/color/
-- activar). Los 9 estados core quedan protegidos (is_system): el usuario edita
-- label/color/orden/activo pero no borra ni recodea, para no romper la lógica de
-- negocio anclada a code/kind (envío, derivación de Fase 6, buckets KPI).
-- Solo se toca quotes.status; los enums quote_item_status / supplier_order_status
-- NO se modifican.

-- 1. Tabla catálogo (por organización) --------------------------------------
create table public.quote_statuses (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code            text not null,
  label           text not null,
  color           text not null,
  is_solid        boolean not null default false,
  on_color        text,
  kind            text not null default 'open',
  sort_order      integer not null default 0,
  is_active       boolean not null default true,
  is_system       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint quote_statuses_code_uq unique (organization_id, code),
  constraint quote_statuses_kind_ck check (kind in ('draft','open','sent','in_review','won','lost','closed')),
  constraint quote_statuses_color_ck check (color ~* '^#[0-9a-f]{6}$'),
  constraint quote_statuses_on_color_ck check (on_color is null or on_color ~* '^#[0-9a-f]{6}$')
);
create index idx_quote_statuses_org on public.quote_statuses(organization_id, sort_order);

create trigger trg_quote_statuses_updated_at
  before update on public.quote_statuses
  for each row execute function public.set_updated_at();

-- 2. Seed de los 9 core por organización (idempotente) + backfill + futuras --
create or replace function public.seed_default_quote_statuses(p_org uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.quote_statuses
    (organization_id, code, label, color, is_solid, on_color, kind, sort_order, is_active, is_system)
  values
    (p_org, 'draft',         'Borrador',          '#9aa1ab', false, null,      'draft',     10, true, true),
    (p_org, 'review_future', 'Revisión a futuro', '#9aa1ab', false, null,      'open',      20, true, true),
    (p_org, 'sent',          'Enviada',           '#7eb8ff', false, null,      'sent',      30, true, true),
    (p_org, 'under_review',  'En revisión',       '#f5c95a', false, null,      'in_review', 40, true, true),
    (p_org, 'modified',      'Modificada',        '#8b5cf6', false, null,      'in_review', 50, true, true),
    (p_org, 'accepted',      'Aceptada',          '#86c99a', false, null,      'won',       60, true, true),
    (p_org, 'rejected',      'Rechazada',         '#e5675f', false, null,      'lost',      70, true, true),
    (p_org, 'purchased',     'Contrato firmado',  '#3bc9c9', false, null,      'won',       80, true, true),
    (p_org, 'closed',        'Cerrada',           '#1f8f4d', true,  '#ffffff', 'closed',    90, true, true)
  on conflict (organization_id, code) do nothing;
$$;

select public.seed_default_quote_statuses(id) from public.organizations;

create or replace function public.trg_seed_quote_statuses()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_default_quote_statuses(new.id);
  return new;
end;
$$;

create trigger trg_organizations_seed_quote_statuses
  after insert on public.organizations
  for each row execute function public.trg_seed_quote_statuses();

-- 3. Convertir quotes.status de enum a texto -------------------------------
drop index if exists public.idx_quotes_status_active;
alter table public.quotes alter column status drop default;
alter table public.quotes alter column status type text using status::text;
alter table public.quotes alter column status set default 'draft';
create index idx_quotes_status_active on public.quotes (status)
  where status <> all (array['closed', 'rejected']);

-- 4. FK compuesta: el estado debe existir dentro de la organización ---------
alter table public.quotes
  add constraint quotes_status_fk
  foreign key (organization_id, status)
  references public.quote_statuses (organization_id, code);

-- 5. Eliminar el enum viejo (solo quotes.status lo usaba, ya convertido) -----
drop type if exists public.quote_status;

-- 6. Guard: proteger los estados de sistema ---------------------------------
create or replace function public.guard_system_quote_status()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.is_system then
      raise exception 'No se puede eliminar un estado de sistema (%).', old.code;
    end if;
    return old;
  end if;
  -- UPDATE
  if old.is_system and (
       new.code is distinct from old.code
    or new.kind is distinct from old.kind
    or new.is_system is distinct from old.is_system
  ) then
    raise exception 'No se puede cambiar code/kind/is_system de un estado de sistema (%).', old.code;
  end if;
  return new;
end;
$$;

create trigger trg_guard_system_quote_status
  before update or delete on public.quote_statuses
  for each row execute function public.guard_system_quote_status();

-- 7. Permiso nuevo + grants -------------------------------------------------
insert into public.permissions (code, name, description) values
  ('quote_status.manage', 'Gestionar estados de cotización',
   'Crear, renombrar, reordenar, colorear y activar/desactivar los estados del pipeline de cotizaciones.')
on conflict (code) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code in ('administrador', 'crm_admin') and p.code = 'quote_status.manage'
on conflict do nothing;

-- 8. RLS --------------------------------------------------------------------
alter table public.quote_statuses enable row level security;

create policy quote_statuses_select on public.quote_statuses
  for select to authenticated
  using (organization_id in (select public.current_user_organization_ids()));

create policy quote_statuses_write on public.quote_statuses
  for all to authenticated
  using (
    organization_id in (select public.current_user_organization_ids())
    and (public.current_user_is_super() or public.current_user_has_permission('quote_status.manage'))
  )
  with check (
    organization_id in (select public.current_user_organization_ids())
    and (public.current_user_is_super() or public.current_user_has_permission('quote_status.manage'))
  );

-- 9. RPC de reordenamiento (respeta RLS por ser SECURITY INVOKER) -----------
create or replace function public.reorder_quote_statuses(p_ids uuid[])
returns void
language sql
security invoker
set search_path = public
as $$
  update public.quote_statuses qs
  set sort_order = t.ord * 10
  from unnest(p_ids) with ordinality as t(id, ord)
  where qs.id = t.id;
$$;

revoke execute on function public.reorder_quote_statuses(uuid[]) from anon, public;
grant execute on function public.reorder_quote_statuses(uuid[]) to authenticated;
