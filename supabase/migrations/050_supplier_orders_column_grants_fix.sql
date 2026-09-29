-- Fix de 049: revoca el SELECT de TABLA completa en `supplier_orders` para
-- `anon`/`authenticated` (en vez del revoke de columna, que no restringía
-- nada — ver nota en 049), y vuelve a otorgar SELECT a `authenticated` columna
-- por columna, excluyendo `items` (costo real) y `token` (magic link de 30
-- días a /proveedor/<token>, que muestra costo). `anon` no recibe nada de
-- vuelta: no tiene policy de RLS propia sobre esta tabla, las dos vistas
-- públicas por magic link (/proveedor/[token], confirmSupplierReception) ya
-- resuelven con el cliente service-role, que no se ve afectado por este
-- revoke (ver getSupplierOrderByToken/confirmSupplierOrder).
--
-- Verificado en vivo con has_column_privilege() + un SELECT real simulando
-- `set local role authenticated`: `token`/`items` dan "permission denied for
-- table supplier_orders", el resto de columnas se leen normal, `service_role`
-- no cambia. Advisor sin hallazgos nuevos.
--
-- La lectura para armar `supplierOrders` en crm/[id]/page.tsx y la escritura
-- (upsert al enviar la orden, en supplier-order-actions.ts) ya usan el
-- cliente service-role desde este mismo cambio — ningún código de la app
-- dependía de leer/escribir `items`/`token` con el cliente de sesión.

revoke select on public.supplier_orders from anon, authenticated;

grant select (
  id, quote_id, supplier_name, supplier_email, status, sent_at, confirmed_at,
  supplier_comment, expires_at, created_at, updated_at, message
) on public.supplier_orders to authenticated;
