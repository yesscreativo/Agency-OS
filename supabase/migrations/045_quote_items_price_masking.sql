-- Ítem E de la auditoría de seguridad (2026-09-13): `cost_price`/`client_price`
-- de quote_items solo estaban protegidos por la UI. RLS es por FILA, no por
-- columna, así que un usuario autenticado sin `quote.see_costs` podía leer el
-- costo/margen de cualquier cotización de su organización llamando directo a
-- `/rest/v1/quote_items`. El modelo de permisos ya es simétrico (crm_creator ve
-- costo pero NUNCA precio cliente; crm_viewer/KAM ve precio cliente pero NUNCA
-- costo — ver 013_crm_role_matrix.sql), así que la protección debe serlo también.
--
-- Solución: una vista con enmascarado por columna según el permiso del usuario
-- que consulta (`security_invoker = true` para que el RLS de organización de la
-- tabla base se siga evaluando con el rol real de quien llama, no el dueño de la
-- vista). Se revoca el select directo a la tabla cruda para anon/authenticated;
-- solo queda alcanzable vía la vista o vía service_role (bypassa RLS/grants).
--
-- OJO al usar esto en código nuevo: `getQuoteById` (el existente, sin tocar) y
-- `listQuotes`/`listPipelineQuotes`/`listQuoteStatsRows`/`listClientQuotes` en
-- packages/db se repuntan según el caso — ver el companion en
-- packages/db/src/repositories/quotes.ts para el porqué de cada uno.

create view public.quote_items_secure
with (security_invoker = true) as
select
  id,
  quote_id,
  description,
  quantity,
  status,
  client_comment,
  sort_order,
  supplier,
  is_group,
  created_at,
  updated_at,
  deleted_at,
  case when public.current_user_has_permission('quote.see_client_price')
    then client_price else null end as client_price,
  case when public.current_user_has_permission('quote.see_costs')
    then cost_price else null end as cost_price
from public.quote_items;

revoke select on public.quote_items from anon, authenticated;
grant select on public.quote_items_secure to authenticated;

-- Escritura: `quote_items_write` (003_rls.sql) permite insert/update a cualquiera
-- con `quote.update`, sin distinguir qué columna se toca — un Creador (sin
-- quote.see_client_price) podía pisar client_price, y un KAM (sin quote.see_costs)
-- podía pisar cost_price, vía REST directo. `saveQuoteDraft` ya evita esto en la
-- app (preserva el valor si el usuario no tiene el permiso), pero eso no protege
-- contra un cliente REST que no pase por la app. Este trigger lo hace explícito
-- a nivel de base de datos.
create or replace function public.guard_quote_item_price_permissions()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- service_role (scripts de backend, migraciones) no tiene auth.uid(): se deja
  -- pasar sin validar, solo se controla a sesiones de usuario reales. BYPASSRLS
  -- protege de las políticas RLS pero NO de triggers, así que sin este bypass
  -- explícito cualquier escritura vía service_role con precio ≠ 0 fallaría.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.cost_price <> 0 and not public.current_user_has_permission('quote.see_costs') then
      raise exception 'No tienes permiso para fijar el costo de este ítem.';
    end if;
    if new.client_price <> 0 and not public.current_user_has_permission('quote.see_client_price') then
      raise exception 'No tienes permiso para fijar el precio de cliente de este ítem.';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.cost_price is distinct from old.cost_price
       and not public.current_user_has_permission('quote.see_costs') then
      raise exception 'No tienes permiso para modificar el costo de este ítem.';
    end if;
    if new.client_price is distinct from old.client_price
       and not public.current_user_has_permission('quote.see_client_price') then
      raise exception 'No tienes permiso para modificar el precio de cliente de este ítem.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists guard_quote_item_price_permissions on public.quote_items;
create trigger guard_quote_item_price_permissions
  before insert or update on public.quote_items
  for each row execute function public.guard_quote_item_price_permissions();
