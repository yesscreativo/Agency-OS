-- Mensaje (opcional) que el equipo escribe AL enviar la orden al proveedor.
-- Antes solo viajaba en el webhook de n8n (para el correo) y no se persistía, así
-- que se perdía al recargar y no aparecía en la vista pública del proveedor.
-- OJO: es distinto de `supplier_comment`, que es la respuesta DEL proveedor.

alter table public.supplier_orders
  add column if not exists message text;
