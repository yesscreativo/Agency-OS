-- Matriz de permisos definitiva para los roles del módulo CRM.
-- Reemplaza el mapeo PROVISIONAL de 009_modules_rbac.sql.
--
-- Regla clave: creador y visualizador ven precios OPUESTOS, por eso se separa el
-- antiguo `quote.see_costs` en dos permisos independientes:
--   - quote.see_costs         -> ver/editar el PRECIO COSTO   (admin, creador)
--   - quote.see_client_price  -> ver/editar el PRECIO CLIENTE (admin, visualizador)
-- El MARGEN es la intersección de ambos -> solo el admin lo ve.

-- 1. Permisos nuevos --------------------------------------------------------
insert into public.permissions (code, name, description) values
  ('quote.see_client_price', 'Ver precio cliente',
   'Ver y editar el precio de cliente y el margen de las cotizaciones.'),
  ('quote.send', 'Enviar cotización',
   'Enviar la cotización al cliente y gestionar los destinatarios del enlace público.'),
  ('quote.pipeline', 'Ver Kanban',
   'Acceder al tablero Kanban del pipeline de cotizaciones.'),
  ('quote.dashboard', 'Ver Dashboard',
   'Acceder al dashboard de indicadores del CRM.')
on conflict (code) do nothing;

-- 2. Reconciliación autoritativa de los 3 roles CRM -------------------------
-- Se borran los grants actuales de crm_admin/crm_creator/crm_viewer y se
-- reinsertan según la matriz definitiva (idempotente aunque cambie 009/010/012).
delete from public.role_permissions
where role_id in (
  select id from public.roles where code in ('crm_admin', 'crm_creator', 'crm_viewer')
);

-- crm_admin: sin restricciones (crear/modificar/eliminar/enviar; ve costo, precio
-- cliente y margen; administra estado, KAM/PM, estados y clientes).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = any (array[
  'quote.create', 'quote.read', 'quote.update', 'quote.approve', 'quote.send',
  'quote.see_costs', 'quote.see_client_price', 'quote.pipeline', 'quote.dashboard',
  'client.manage', 'kam.manage', 'quote_status.manage'
])
where r.code = 'crm_admin'
on conflict do nothing;

-- crm_creator: crea/edita cotizaciones poniendo SOLO precio costo. No ve margen
-- ni precio cliente; no envía, no cambia estado, no ve kanban/dashboard/clientes.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = any (array[
  'quote.create', 'quote.read', 'quote.update', 'quote.see_costs'
])
where r.code = 'crm_creator'
on conflict do nothing;

-- crm_viewer: solo lectura. Ve SOLO precio cliente (no costo, no margen); solo el
-- listado y el detalle en solo-lectura para descargar el PDF cliente.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = any (array[
  'quote.read', 'quote.see_client_price'
])
where r.code = 'crm_viewer'
on conflict do nothing;
