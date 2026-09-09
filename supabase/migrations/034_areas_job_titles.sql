-- Estructura organizacional: un Área tiene un gerente (manager_user_id); sus
-- colaboradores (people.area_id) reportan a él automáticamente — no hay campo
-- "reporta a" independiente. Un Cargo (job_title) es solo una etiqueta
-- (RRHH/organigrama, sin permisos) y siempre pertenece a un Área. Base para
-- "Carga del equipo" y, más adelante, el módulo de vacaciones de RRHH. Ver
-- Docs/superpowers/specs/2026-09-04-areas-cargos-carga-equipo-design.md.

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  manager_user_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_titles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.people add column area_id uuid references public.areas(id);
alter table public.people add column job_title_id uuid references public.job_titles(id);

alter table public.areas enable row level security;
alter table public.job_titles enable row level security;

create policy areas_select on public.areas
  for select to authenticated
  using (organization_id in (select public.current_user_organization_ids()));
create policy areas_write on public.areas
  for all to authenticated
  using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_is_super()
  );

create policy job_titles_select on public.job_titles
  for select to authenticated
  using (organization_id in (select public.current_user_organization_ids()));
create policy job_titles_write on public.job_titles
  for all to authenticated
  using (
    organization_id in (select public.current_user_organization_ids())
    and (
      public.current_user_is_super()
      or exists (
        select 1 from public.areas a
        where a.id = job_titles.area_id and a.manager_user_id = auth.uid()
      )
    )
  );

-- El gerente de un área puede tocar (solo) el cargo de las personas de su
-- área — la server action correspondiente solo manda `job_title_id` en el
-- UPDATE (RLS no filtra por columna). Asignar el ÁREA de una persona sigue
-- siendo solo de super admin, vía service_role (mismo patrón que
-- inviteUser/deleteUser en access-actions.ts) — no necesita policy nueva.
create policy people_manager_update on public.people
  for update to authenticated
  using (
    exists (
      select 1 from public.areas a
      where a.id = people.area_id and a.manager_user_id = auth.uid()
    )
  );
