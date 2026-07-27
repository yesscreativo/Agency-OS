-- Permiso dedicado para ENVIAR órdenes a proveedores, separado de quote.approve.
--
-- Antes, la sección "Órdenes a proveedores" (y la acción sendSupplierOrder) se
-- protegían con `quote.approve`, que además habilita cambiar estado, editar docs
-- comerciales, gestionar el brief y ELIMINAR la cotización. El rol Creador debe
-- poder enviar a proveedores SIN ganar esas otras capacidades, así que el envío a
-- proveedores pasa a su propio permiso `quote.supplier_order`.

-- 1. Permiso nuevo ----------------------------------------------------------
insert into public.permissions (code, name, description) values
  ('quote.supplier_order', 'Enviar órdenes a proveedores',
   'Enviar (y reenviar) las órdenes de compra a los proveedores de una cotización aceptada.')
on conflict (code) do nothing;

-- 2. Grants -----------------------------------------------------------------
-- Todos los que antes podían enviar vía quote.approve (administrador, director,
-- crm_admin) + el rol Creador (crm_creator), que es la nueva incorporación.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.code = 'quote.supplier_order'
where r.code in ('administrador', 'director', 'crm_admin', 'crm_creator')
on conflict do nothing;
