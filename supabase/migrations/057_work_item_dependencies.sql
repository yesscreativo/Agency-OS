-- 057_work_item_dependencies.sql
-- Dependencias/bloqueos básicos entre tareas del Gantt. Solo rechaza el ciclo
-- directo A↔B (constraint unique + check); sin motor de ciclos multi-salto —
-- ver Docs/superpowers/specs/2026-09-30-gantt-proyectos-design.md sección 4.

create table public.work_item_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  depends_on_work_item_id uuid not null references public.work_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint work_item_dependencies_no_self check (work_item_id <> depends_on_work_item_id),
  constraint work_item_dependencies_unique unique (work_item_id, depends_on_work_item_id)
);
create index work_item_dependencies_item_idx on public.work_item_dependencies(work_item_id);
create index work_item_dependencies_blocker_idx on public.work_item_dependencies(depends_on_work_item_id);

alter table public.work_item_dependencies enable row level security;

create policy work_item_dependencies_select on public.work_item_dependencies
  for select using (organization_id in (select public.current_user_organization_ids()));
create policy work_item_dependencies_write on public.work_item_dependencies
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('project.manage')
  );
