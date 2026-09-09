-- Checklist en work items (ClickUp Parity Fase B, sección 3, retomada). Una
-- sola lista simple de pasos por tarea/subtarea (sin checklists nombradas ni
-- agrupación). El ejecutor (asignado al work item) puede escribir su propia
-- checklist sin necesitar project.manage; project.manage siempre puede
-- escribir cualquiera. Ver Docs/superpowers/specs/2026-09-08-checklist-items-design.md.
create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  is_completed boolean not null default false,
  completed_by uuid references public.users(id),
  completed_at timestamptz,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index checklist_items_item_idx
  on public.checklist_items(work_item_id, sort_order)
  where deleted_at is null;

alter table public.checklist_items enable row level security;

create policy checklist_items_select on public.checklist_items
  for select using (organization_id in (select public.current_user_organization_ids()));

-- Escritura: project.manage (cualquier checklist) O ser asignado del work item
-- (el ejecutor arma/tilda la suya propia, sin necesitar el permiso amplio).
create policy checklist_items_write on public.checklist_items
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and (
      public.current_user_has_permission('project.manage')
      or exists (
        select 1 from public.work_item_assignees wa
        where wa.work_item_id = checklist_items.work_item_id
        and wa.user_id = auth.uid()
      )
    )
  );
