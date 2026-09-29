-- Bug real encontrado en QA manual (Yesid, 2026-09-29): un usuario con rol
-- `is_super = true` (p.ej. "Administrador") pero SIN la fila explícita de
-- `quote.see_client_price`/`quote.see_costs` en `role_permissions` quedaba
-- bloqueado: la app (`hasPermission()` en auth.ts) sí conoce el bypass de
-- `is_super` y por eso NO activaba la lógica de "preservar el precio real al
-- guardar" (esa lógica solo se dispara cuando la app sabe que el usuario está
-- enmascarado) — pero `get_quote_items_secure` (047) y el trigger
-- `guard_quote_item_price_permissions` (045, migrado a scoped-por-org en 052)
-- nunca conocieron ese bypass, así que:
--   - en lectura: la RPC enmascaraba el precio a null igual, la página lo
--     mostraba en 0 → margen -100%.
--   - en escritura: la app mandaba el 0 que tenía en pantalla (al pensar que
--     sí podía verlo, no hacía falta preservar nada) y el trigger lo rechazaba
--     por "no tener permiso" — rompía Guardar borrador y Enviar al cliente
--     para cualquier usuario is_super.
--
-- El proyecto ya tiene el patrón correcto para esto en otras policies/RPCs
-- (`current_user_is_super() or current_user_has_permission(...)`, ver
-- 012_quote_status_catalog.sql / 034_areas_job_titles.sql /
-- 035_fix_people_manager_update_scope.sql) — solo faltaba aplicarlo aquí.

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
    case when public.current_user_is_super()
      or public.current_user_has_permission_in_org('quote.see_client_price', q.organization_id)
      then qi.client_price else null end,
    case when public.current_user_is_super()
      or public.current_user_has_permission_in_org('quote.see_costs', q.organization_id)
      then qi.cost_price else null end
  from public.quote_items qi
  join public.quotes q on q.id = qi.quote_id
  where qi.quote_id = any(p_quote_ids)
    and q.organization_id in (select public.current_user_organization_ids());
$$;

create or replace function public.guard_quote_item_price_permissions()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_org uuid;
begin
  if auth.uid() is null then
    return new;
  end if;

  if public.current_user_is_super() then
    return new;
  end if;

  select organization_id into v_org from public.quotes where id = new.quote_id;

  if tg_op = 'INSERT' then
    if new.cost_price <> 0 and not public.current_user_has_permission_in_org('quote.see_costs', v_org) then
      raise exception 'No tienes permiso para fijar el costo de este ítem.';
    end if;
    if new.client_price <> 0 and not public.current_user_has_permission_in_org('quote.see_client_price', v_org) then
      raise exception 'No tienes permiso para fijar el precio de cliente de este ítem.';
    end if;
  elsif tg_op = 'UPDATE' then
    if new.cost_price is distinct from old.cost_price
       and not public.current_user_has_permission_in_org('quote.see_costs', v_org) then
      raise exception 'No tienes permiso para modificar el costo de este ítem.';
    end if;
    if new.client_price is distinct from old.client_price
       and not public.current_user_has_permission_in_org('quote.see_client_price', v_org) then
      raise exception 'No tienes permiso para modificar el precio de cliente de este ítem.';
    end if;
  end if;
  return new;
end;
$$;
