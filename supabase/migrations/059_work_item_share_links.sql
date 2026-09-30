-- 059_work_item_share_links.sql
-- Link público de solo lectura del Gantt, uno por proyecto. Sin expires_at a
-- propósito (un proyecto dura semanas/meses, no como un link de cotización de
-- 5 días) — se invalida solo con revoked_at. Mismo patrón de token que
-- quote_recipients/supplier_orders (002_crm.sql).

create table public.work_item_share_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null unique references public.work_items(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  revoked_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

alter table public.work_item_share_links enable row level security;

create policy work_item_share_links_select on public.work_item_share_links
  for select using (organization_id in (select public.current_user_organization_ids()));
create policy work_item_share_links_write on public.work_item_share_links
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('project.manage')
  );
