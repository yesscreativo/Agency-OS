-- Fase 5d: políticas que faltaban para el flujo de envío.

-- quote_versions: solo lectura tenía policy; el snapshot al enviar necesita INSERT.
-- (Sin UPDATE/DELETE a propósito: las versiones son inmutables.)
create policy quote_versions_insert on public.quote_versions
  for insert to authenticated with check (
    exists (
      select 1 from public.quotes q
      where q.id = quote_versions.quote_id
        and q.organization_id in (select public.current_user_organization_ids())
        and public.current_user_has_permission('quote.update')
    )
  );

-- next_quote_seq: pasa a SECURITY DEFINER para que el contador funcione sin abrir
-- quote_code_counters por RLS (la tabla queda sin policies = inaccesible directo).
create or replace function public.next_quote_seq(p_client_id uuid, p_day date)
returns integer
language sql
security definer
set search_path = public
as $$
  insert into public.quote_code_counters (client_id, day, last_seq)
  values (p_client_id, p_day, 1)
  on conflict (client_id, day)
  do update set last_seq = public.quote_code_counters.last_seq + 1
  returning last_seq;
$$;

revoke execute on function public.next_quote_seq(uuid, date) from public, anon;
grant execute on function public.next_quote_seq(uuid, date) to authenticated;
