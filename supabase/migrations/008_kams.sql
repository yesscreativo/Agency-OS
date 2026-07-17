-- Catálogo de KAM/PM: responsables de cuenta asignables a cotizaciones.
-- No son usuarios con login (paridad con el cotizador legacy); se administran
-- en /crm/usuarios con el permiso users.manage.
create table public.kams (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

alter table public.quotes add column kam_id uuid references public.kams(id);
create index quotes_kam_id_idx on public.quotes(kam_id);

alter table public.kams enable row level security;

create policy kams_select on public.kams
  for select using (organization_id in (select public.current_user_organization_ids()));
create policy kams_write on public.kams
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('users.manage')
  );
