-- Cronómetro en curso: un solo timer activo por usuario (PK user_id). Al detener,
-- la server action calcula minutos e inserta una entrada en work_item_time_entries.
create table public.work_item_active_timers (
  user_id uuid primary key references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  started_at timestamptz not null default now()
);

alter table public.work_item_active_timers enable row level security;

-- Cada quien ve/gestiona SOLO su propio timer.
create policy work_item_active_timers_select on public.work_item_active_timers
  for select to authenticated using (user_id = auth.uid());
create policy work_item_active_timers_insert on public.work_item_active_timers
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and organization_id in (select public.current_user_organization_ids())
  );
create policy work_item_active_timers_update on public.work_item_active_timers
  for update to authenticated using (user_id = auth.uid());
create policy work_item_active_timers_delete on public.work_item_active_timers
  for delete to authenticated using (user_id = auth.uid());
