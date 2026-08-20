-- Proyectos / Work Items — Fase A: esquema base, módulo activo y RBAC.
-- Modela project/task/subtask como una única tabla `work_items` (enum
-- work_item_type), evitando crear entidades separadas "projects"/"tickets"
-- que no existen en el modelo de datos (ver Docs/CLAUDE.md, incoherencia #3).

-- Enums ----------------------------------------------------------------
create type public.work_item_type as enum ('project', 'task', 'subtask');
create type public.work_item_priority as enum ('low', 'normal', 'high', 'urgent');
create type public.project_state as enum ('active', 'completed', 'archived');

-- work_items -------------------------------------------------------------
create table public.work_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  type public.work_item_type not null,
  project_id uuid not null,               -- proyecto dueño (para un row project = su propio id)
  parent_id uuid references public.work_items(id) on delete cascade,
  title text not null,
  description text,
  status_id uuid,                          -- FK a work_item_statuses (task/subtask); null en project
  project_state public.project_state,      -- solo en project (default active)
  priority public.work_item_priority not null default 'normal',
  client_id uuid references public.clients(id),
  quote_id uuid references public.quotes(id),
  start_date date,
  due_date date,
  sort_order int not null default 0,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint work_items_project_needs_client check (type <> 'project' or client_id is not null),
  constraint work_items_project_has_state   check (type <> 'project' or project_state is not null)
);
create index work_items_project_idx on public.work_items(project_id) where deleted_at is null;
create index work_items_org_idx on public.work_items(organization_id) where deleted_at is null;

-- work_item_statuses (columnas del tablero, por proyecto) ----------------
create table public.work_item_statuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null references public.work_items(id) on delete cascade,
  label text not null,
  color text not null default '#9aa1ab',
  sort_order int not null default 0,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);
create index work_item_statuses_project_idx on public.work_item_statuses(project_id);

alter table public.work_items
  add constraint work_items_status_fk foreign key (status_id) references public.work_item_statuses(id) on delete set null;

-- work_item_assignees ------------------------------------------------------
create table public.work_item_assignees (
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  primary key (work_item_id, user_id)
);

-- Seed de estados por defecto al crear un proyecto --------------------------
create or replace function public.seed_default_work_item_statuses(p_project_id uuid, p_org uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.work_item_statuses (organization_id, project_id, label, color, sort_order, is_done) values
    (p_org, p_project_id, 'Por hacer',   '#9aa1ab', 0, false),
    (p_org, p_project_id, 'En progreso', '#7eb8ff', 1, false),
    (p_org, p_project_id, 'En revisión', '#f5c95a', 2, false),
    (p_org, p_project_id, 'Hecho',       '#1f8f4d', 3, true);
$$;

-- RLS (patrón CRM) ----------------------------------------------------------
alter table public.work_items enable row level security;
alter table public.work_item_statuses enable row level security;
alter table public.work_item_assignees enable row level security;

create policy work_items_select on public.work_items
  for select using (organization_id in (select public.current_user_organization_ids()));
create policy work_items_write on public.work_items
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('project.manage')
  );

create policy work_item_statuses_select on public.work_item_statuses
  for select using (organization_id in (select public.current_user_organization_ids()));
create policy work_item_statuses_write on public.work_item_statuses
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('project.manage')
  );

create policy work_item_assignees_select on public.work_item_assignees
  for select using (organization_id in (select public.current_user_organization_ids()));
create policy work_item_assignees_write on public.work_item_assignees
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('project.assign')
  );

-- Permisos + módulo ----------------------------------------------------------
insert into public.permissions (code, name, description) values
  ('project.view', 'Ver proyectos', null),
  ('project.manage', 'Crear/editar proyectos, tareas y estados', null),
  ('project.assign', 'Asignar usuarios a work items', null)
on conflict (code) do nothing;

update public.modules set is_active = true where code = 'proyectos';

-- Otorgar a super (administrador) y a los roles del CRM con gestión
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.code in ('project.view', 'project.manage', 'project.assign')
  and r.code in ('administrador', 'crm_admin', 'director')
on conflict do nothing;
