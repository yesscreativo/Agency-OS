insert into public.organizations (code, name) values ('laburu', 'Laburu')
  on conflict (code) do nothing;

insert into public.roles (code, name) values
  ('administrador', 'Administrador'),
  ('director', 'Director'),
  ('rrhh', 'RRHH'),
  ('kam', 'KAM'),
  ('pm', 'PM'),
  ('lider', 'Líder'),
  ('colaborador', 'Colaborador'),
  ('cliente', 'Cliente')
on conflict (code) do nothing;

insert into public.permissions (code, name) values
  ('quote.create', 'Crear cotizaciones'),
  ('quote.read', 'Ver cotizaciones'),
  ('quote.update', 'Editar cotizaciones'),
  ('quote.approve', 'Aprobar/cerrar cotizaciones'),
  ('quote.see_costs', 'Ver precios de costo y margen'),
  ('client.manage', 'Gestionar clientes'),
  ('people.manage', 'Gestionar personas'),
  ('users.manage', 'Gestionar usuarios y roles')
on conflict (code) do nothing;

-- Administrador y Director: todos los permisos
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p
where r.code in ('administrador', 'director')
on conflict do nothing;

-- KAM: cotizaciones + clientes, sin ver costos
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p
  on p.code in ('quote.create', 'quote.read', 'quote.update', 'client.manage')
where r.code = 'kam'
on conflict do nothing;

-- PM: cotizaciones con visibilidad de costos, sin gestionar clientes
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p
  on p.code in ('quote.create', 'quote.read', 'quote.update', 'quote.see_costs')
where r.code = 'pm'
on conflict do nothing;

-- Colaborador: solo lectura de cotizaciones
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p
  on p.code = 'quote.read'
where r.code = 'colaborador'
on conflict do nothing;
