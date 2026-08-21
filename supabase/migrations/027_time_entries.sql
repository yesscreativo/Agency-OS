-- Registro de tiempo por tarea (Fase C). Cada entrada es tiempo YA registrado
-- (manual o resultado de un cronómetro detenido), atribuido a quien lo registró
-- y sumable. project_id se denormaliza para agregar reportes sin re-join.
create table public.work_item_time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  project_id uuid not null references public.work_items(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  minutes integer not null check (minutes > 0),
  spent_on date not null default current_date,
  note text,
  source text not null default 'manual' check (source in ('manual', 'timer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index work_item_time_entries_work_item_idx on public.work_item_time_entries (work_item_id);
create index work_item_time_entries_project_idx on public.work_item_time_entries (project_id);
create index work_item_time_entries_user_spent_idx on public.work_item_time_entries (user_id, spent_on);

alter table public.work_item_time_entries enable row level security;

-- Ver: miembros de la org (el acceso al módulo ya exige project.view en el layout).
create policy work_item_time_entries_select on public.work_item_time_entries
  for select to authenticated
  using (organization_id in (select public.current_user_organization_ids()));

-- Registrar: solo lo tuyo, dentro de tu org.
create policy work_item_time_entries_insert on public.work_item_time_entries
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and organization_id in (select public.current_user_organization_ids())
  );

-- Editar/borrar: el dueño, o un manager de proyectos.
create policy work_item_time_entries_update on public.work_item_time_entries
  for update to authenticated
  using (
    organization_id in (select public.current_user_organization_ids())
    and (user_id = auth.uid() or public.current_user_has_permission('project.manage'))
  );
create policy work_item_time_entries_delete on public.work_item_time_entries
  for delete to authenticated
  using (
    organization_id in (select public.current_user_organization_ids())
    and (user_id = auth.uid() or public.current_user_has_permission('project.manage'))
  );
