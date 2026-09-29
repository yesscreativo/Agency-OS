-- Reemplaza el intento de 045 (vista `quote_items_secure` con
-- security_invoker=true, revertida en la migración de rollback anterior: con
-- security_invoker=true, Postgres exige que el rol que INVOCA la vista tenga
-- permiso directo sobre cada columna referenciada en su definición —incluso
-- dentro de un CASE que la termine devolviendo null—, así que revocarle SELECT
-- a `authenticated` sobre `quote_items` rompía la vista para TODOS, no solo
-- para quien no debía ver el costo. Confirmado en vivo contra el REST API real.
--
-- Función SECURITY DEFINER en su lugar: corre con los privilegios del DUEÑO
-- de la función (puede leer la tabla aunque `authenticated` no pueda), por lo
-- que el chequeo de organización que antes daba el RLS automáticamente hay que
-- escribirlo a mano aquí (mismo patrón que current_user_has_permission /
-- current_user_organization_ids, que tampoco dependen de RLS).
--
-- Recibe un array de quote_id (el caller ya sabe cuáles cotizaciones está
-- listando/mostrando) en vez de "traer todo", para no abrir un modo
-- "dump completo de items de la organización" que nadie necesita.
create or replace function public.get_quote_items_secure(p_quote_ids uuid[])
returns table (
  id uuid,
  quote_id uuid,
  description text,
  quantity integer,
  status text,
  client_comment text,
  sort_order integer,
  supplier text,
  is_group boolean,
  created_at timestamptz,
  updated_at timestamptz,
  deleted_at timestamptz,
  client_price numeric,
  cost_price numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    qi.id, qi.quote_id, qi.description, qi.quantity, qi.status::text,
    qi.client_comment, qi.sort_order, qi.supplier, qi.is_group,
    qi.created_at, qi.updated_at, qi.deleted_at,
    case when public.current_user_has_permission('quote.see_client_price')
      then qi.client_price else null end,
    case when public.current_user_has_permission('quote.see_costs')
      then qi.cost_price else null end
  from public.quote_items qi
  join public.quotes q on q.id = qi.quote_id
  where qi.quote_id = any(p_quote_ids)
    and q.organization_id in (select public.current_user_organization_ids());
$$;

revoke all on function public.get_quote_items_secure(uuid[]) from public, anon;
grant execute on function public.get_quote_items_secure(uuid[]) to authenticated;

-- Ahora sí es seguro: nada del código de la app depende de leer quote_items
-- directo con el cliente de sesión para mostrar precios (todo pasa por esta
-- función, o por getQuoteById con service-role para los 3 casos internos que
-- necesitan el valor real — ver packages/db/src/repositories/quotes.ts).
revoke select on public.quote_items from anon, authenticated;
