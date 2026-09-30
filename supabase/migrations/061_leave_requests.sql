-- 061_leave_requests.sql
-- Reemplaza el formulario externo (vacaciones.laburuagency.com) + n8n +
-- ClickUp por un módulo propio. Ver Docs/superpowers/specs/2026-09-30-vacaciones-rrhh-design.md.

create type public.leave_request_type as enum (
  'vacaciones',
  'home_office',
  'permiso_personal',
  'licencia_medica',
  'licencia_maternidad_paternidad',
  'calamidad_domestica',
  'otro'
);

create type public.leave_approval_status as enum ('pending', 'approved', 'rejected');

create table public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  requester_user_id uuid not null references public.users(id),
  type public.leave_request_type not null,
  start_date date not null,
  end_date date not null,
  return_date date,
  notes text,
  attachment_path text,
  manager_user_id uuid references public.users(id),
  manager_status public.leave_approval_status not null default 'pending',
  manager_decided_at timestamptz,
  manager_reject_reason text,
  hr_status public.leave_approval_status not null default 'pending',
  hr_decided_at timestamptz,
  hr_reject_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint leave_requests_return_date_needs_vacaciones
    check (type <> 'vacaciones' or return_date is not null),
  constraint leave_requests_attachment_required
    check (type not in ('licencia_medica', 'otro') or attachment_path is not null),
  constraint leave_requests_dates_order check (end_date >= start_date)
);
create index leave_requests_requester_idx on public.leave_requests(requester_user_id);
create index leave_requests_manager_idx on public.leave_requests(manager_user_id);
create index leave_requests_org_idx on public.leave_requests(organization_id);

create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  date date not null unique,
  name text not null
);

-- Bucket privado para adjuntos (licencia médica / otro). Mismo patrón que
-- work-item-files (019_work_item_attachments.sql): binario en Storage, la fila
-- de leave_requests guarda solo la ruta; acceso vía signed URL server-side.
insert into storage.buckets (id, name, public, file_size_limit)
values ('leave-request-files', 'leave-request-files', false, 10485760)
on conflict (id) do nothing;

create policy "leave_request_files_select_authenticated" on storage.objects
  for select to authenticated using (bucket_id = 'leave-request-files');
create policy "leave_request_files_insert_authenticated" on storage.objects
  for insert to authenticated with check (bucket_id = 'leave-request-files');

-- RLS ------------------------------------------------------------------
alter table public.leave_requests enable row level security;

create policy leave_requests_select on public.leave_requests
  for select using (
    organization_id in (select public.current_user_organization_ids())
    and (
      requester_user_id = auth.uid()
      or manager_user_id = auth.uid()
      or public.current_user_has_permission('leave.approve_hr')
    )
  );

create policy leave_requests_insert on public.leave_requests
  for insert with check (
    organization_id in (select public.current_user_organization_ids())
    and requester_user_id = auth.uid()
  );

create policy leave_requests_update_manager on public.leave_requests
  for update using (
    organization_id in (select public.current_user_organization_ids())
    and manager_user_id = auth.uid()
    and manager_status = 'pending'
  );

create policy leave_requests_update_hr on public.leave_requests
  for update using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('leave.approve_hr')
    and manager_status = 'approved'
  );

alter table public.public_holidays enable row level security;

create policy public_holidays_select on public.public_holidays
  for select using (true);
create policy public_holidays_write on public.public_holidays
  for all using (public.current_user_has_permission('leave.approve_hr'));

-- Permisos + módulo ------------------------------------------------------
insert into public.permissions (code, name, description) values
  ('leave.request', 'Solicitar permisos/vacaciones', null),
  ('leave.approve_hr', 'Aprobar en segunda instancia (RRHH) y ver reportes', null)
on conflict (code) do nothing;

-- Cualquier colaborador puede solicitar sus propios permisos, sin importar
-- su rol funcional — se otorga a TODOS los roles existentes.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.code = 'leave.request'
on conflict do nothing;

update public.modules set is_active = true where code = 'rrhh';
