-- Agrupar proyectos de un cliente en carpetas con nombre y color (pedido de
-- Yesid tras ver cómo usan Folders/Lists en ClickUp para organizar el trabajo
-- de un cliente grande — ver Docs/superpowers/specs/2026-09-29-carpetas-proyectos-por-cliente-design.md).
--
-- OJO: existe una tabla `public.areas` que es de RRHH/organización interna
-- (departamentos con gerente, para medir carga de trabajo) — NO tiene relación
-- con esto. Por eso el nombre aquí es `project_folders`, no `areas`.
--
-- Una carpeta es de UN cliente (no compartida entre clientes, igual que en
-- ClickUp cada Space tiene sus propios Folders). Un proyecto pertenece a como
-- mucho una carpeta; borrar la carpeta no borra ni bloquea sus proyectos, solo
-- los deja "Sin carpeta" (on delete set null). Hard delete real de la carpeta
-- (sin deleted_at): no se bloquea el borrado en uso y no hay valor en retener
-- carpetas eliminadas.

create table public.project_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  color text not null default '#7eb8ff',
  sort_order integer not null default 0,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_project_folders_client_id on public.project_folders(client_id);

alter table public.work_items
  add column folder_id uuid references public.project_folders(id) on delete set null;

alter table public.project_folders enable row level security;

create policy project_folders_select on public.project_folders
  for select using (organization_id in (select public.current_user_organization_ids()));

create policy project_folders_write on public.project_folders
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('project.manage')
  );
