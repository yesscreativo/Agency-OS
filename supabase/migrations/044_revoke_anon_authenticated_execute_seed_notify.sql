-- 043 revocó EXECUTE de PUBLIC, pero la verificación en vivo (has_function_privilege)
-- mostró que anon/authenticated conservaban el permiso: estas funciones tienen un
-- grant DIRECTO a esos roles (no solo heredado de PUBLIC, probablemente vía
-- `alter default privileges ... grant all on routines to anon, authenticated`
-- del bootstrap del proyecto), así que revocar de PUBLIC no alcanza. Se revoca
-- explícitamente de anon y authenticated, y se re-otorga a authenticated solo en
-- la función que sí se invoca desde la app (ver 043 para el detalle de cada caso).

revoke execute on function public.seed_default_quote_statuses(uuid) from anon, authenticated;
revoke execute on function public.seed_default_work_item_statuses(uuid, uuid) from anon, authenticated;
revoke execute on function public.notify_missing_hours() from anon, authenticated;
revoke execute on function public.notify_overdue_work_items() from anon, authenticated;

grant execute on function public.seed_default_work_item_statuses(uuid, uuid) to authenticated;
