-- RBAC multi-módulo: catálogo de módulos + roles acotados a un módulo.
-- Un usuario accede a un módulo teniendo asignado (user_roles) un rol de ese módulo.
-- Los roles `is_super` (Administrador de sistema) ven/gestionan todos los módulos.

create table public.modules (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,
  name text not null,
  description text,
  icon text,
  is_active boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.roles
  add column module_code text references public.modules(code),
  add column is_super boolean not null default false;

-- Catálogo de módulos (solo CRM operativo; el resto se muestra como "Próximamente").
insert into public.modules (code, name, description, icon, is_active, sort_order) values
  ('crm', 'CRM', 'Cotizaciones, clientes y flujo comercial de la agencia.', 'crm', true, 1),
  ('proyectos', 'Proyectos', 'Work items, tickets y seguimiento de la operación.', 'proyectos', false, 2),
  ('tickets', 'Tickets', 'Solicitudes y soporte por cliente.', 'tickets', false, 3),
  ('rrhh', 'RRHH', 'Personas, jornada y time tracking.', 'rrhh', false, 4),
  ('reportes', 'Reportes', 'Dashboards e indicadores por rol.', 'reportes', false, 5),
  ('configuracion', 'Configuración', 'Workflows, notificaciones y campos personalizados.', 'configuracion', false, 6);

-- El Administrador actual pasa a ser rol de sistema (super): acceso a todos los módulos.
update public.roles set is_super = true where code = 'administrador';

-- Roles del módulo CRM. NOTA: el mapeo de permisos es PROVISIONAL — la matriz
-- definitiva (sobre todo quién ve costos/margen) está pendiente de definición.
insert into public.roles (code, name, description, module_code) values
  ('crm_admin', 'Administrador', 'Gestiona todo el CRM, ve costos y administra accesos.', 'crm'),
  ('crm_creator', 'Creador', 'Crea, edita y envía cotizaciones.', 'crm'),
  ('crm_viewer', 'Visualizador', 'Consulta cotizaciones en solo lectura.', 'crm');

-- Mapeo provisional rol CRM -> permisos (reutiliza los permisos existentes).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = any (array[
  'quote.create', 'quote.read', 'quote.update', 'quote.approve',
  'quote.see_costs', 'client.manage', 'users.manage'
])
where r.code = 'crm_admin';

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = any (array[
  'quote.create', 'quote.read', 'quote.update', 'client.manage'
])
where r.code = 'crm_creator';

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'quote.read'
where r.code = 'crm_viewer';

-- Módulos a los que accede el usuario actual: todos los activos si es super,
-- si no los de sus roles con module_code.
create or replace function public.current_user_module_codes()
returns text[]
language sql
stable
security definer
set search_path = public
as $$
  select case
    when exists (
      select 1
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and r.is_super
    )
    then array(select code from public.modules where is_active order by sort_order)
    else coalesce(array(
      select distinct r.module_code
      from public.user_roles ur
      join public.roles r on r.id = ur.role_id
      where ur.user_id = auth.uid() and r.module_code is not null
    ), array[]::text[])
  end;
$$;

-- modules es catálogo de solo lectura para cualquier autenticado.
alter table public.modules enable row level security;
create policy modules_select on public.modules
  for select using (auth.role() = 'authenticated');
