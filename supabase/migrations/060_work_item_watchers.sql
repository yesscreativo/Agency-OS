-- 060_work_item_watchers.sql
-- Watchers/seguidores: gente que sigue una tarea sin ser responsable (gap real
-- confirmado en Docs/30-Functional/ClickUp-Parity.md). Simétrica a
-- work_item_assignees; a diferencia de esa, requiere solo project.view (no
-- project.assign) — seguir es de menor riesgo que asumir responsabilidad.

create table public.work_item_watchers (
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  created_at timestamptz not null default now(),
  primary key (work_item_id, user_id)
);
create index work_item_watchers_user_idx on public.work_item_watchers(user_id);

alter table public.work_item_watchers enable row level security;

create policy work_item_watchers_select on public.work_item_watchers
  for select using (organization_id in (select public.current_user_organization_ids()));
create policy work_item_watchers_write on public.work_item_watchers
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('project.view')
  );
