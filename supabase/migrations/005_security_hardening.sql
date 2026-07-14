-- Endurece los helpers RLS: search_path fijo, sin ejecución para anon/PUBLIC.
alter function public.set_updated_at() set search_path = public;

alter function public.next_quote_seq(uuid, date) set search_path = public;
alter function public.next_quote_seq(uuid, date) security definer;

revoke execute on function public.current_user_organization_ids() from public;
revoke execute on function public.current_user_has_permission(text) from public;
revoke execute on function public.next_quote_seq(uuid, date) from public;

grant execute on function public.current_user_organization_ids() to authenticated;
grant execute on function public.current_user_has_permission(text) to authenticated;
grant execute on function public.next_quote_seq(uuid, date) to authenticated;
