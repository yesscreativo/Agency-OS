-- Ítem D de la auditoría de seguridad original (P1, no explotable hoy: 1 sola
-- organización, 0 usuarios multi-org) — el helper `current_user_has_permission`
-- no filtra por organización: revisa TODOS los `user_roles` del usuario sin
-- importar en qué organización los tiene. En un mundo multi-org, un usuario con
-- `quote.see_costs` en la Org A vería el costo también en cotizaciones de la
-- Org B donde solo es viewer. El RPC/trigger de E (047/045) heredaron esta
-- misma limitación al construirse sobre el helper global.
--
-- No se reemplaza el helper global — lo siguen usando 15+ policies de RLS
-- existentes y no es urgente tocarlas mientras haya una sola organización real
-- (eso queda diferido, ver Docs/40-Technical/Security.md). Se agrega una
-- variante con scope explícito por organización, y se migran a ella los DOS
-- puntos nuevos de E que ya conocen la organización de la cotización
-- (`get_quote_items_secure` la trae del join con `quotes`; el trigger la
-- resuelve con un lookup). En una sola organización el resultado es idéntico
-- al de hoy — es una corrección hacia adelante, no un cambio de comportamiento.

create or replace function public.current_user_has_permission_in_org(perm_code text, p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = auth.uid()
      and ur.organization_id = p_org
      and p.code = perm_code
  );
$$;

revoke all on function public.current_user_has_permission_in_org(text, uuid) from public, anon;
grant execute on function public.current_user_has_permission_in_org(text, uuid) to authenticated;

-- get_quote_items_secure (047): ya joinea `quotes q`, solo cambia qué helper llama.
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
    case when public.current_user_has_permission_in_org('quote.see_client_price', q.organization_id)
      then qi.client_price else null end,
    case when public.current_user_has_permission_in_org('quote.see_costs', q.organization_id)
      then qi.cost_price else null end
  from public.quote_items qi
  join public.quotes q on q.id = qi.quote_id
  where qi.quote_id = any(p_quote_ids)
    and q.organization_id in (select public.current_user_organization_ids());
$$;

-- guard_quote_item_price_permissions (045): quote_items no tiene organization_id
-- propia, se resuelve con un lookup a quotes por quote_id.
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
