-- Ítem F de la auditoría de seguridad (2026-09-13): estas 4 funciones SECURITY
-- DEFINER eran ejecutables por `anon` (sin login) y `authenticated` vía RPC
-- (`/rest/v1/rpc/<función>`), sin ningún chequeo de autorización interno:
--   - seed_default_quote_statuses / seed_default_work_item_statuses: escriben
--     el catálogo de estados por defecto de CUALQUIER organización/proyecto
--     que se les pase como argumento (contenido fijo, pero escritura no
--     autorizada cross-tenant).
--   - notify_missing_hours / notify_overdue_work_items: disparan las
--     notificaciones de horas/atrasos de TODAS las organizaciones fuera de su
--     horario programado (solo deben correr vía el cron diario).
-- Mismo patrón que 005_security_hardening.sql: revoke de PUBLIC (quita a
-- anon y authenticated) y solo se re-otorga a `authenticated` la función que
-- realmente se invoca desde la app (createProject → seed_default_work_item_statuses).
-- El trigger que siembra estados al crear una organización y el cron de
-- notificaciones corren como el owner de la función, que conserva EXECUTE
-- implícito y no depende de estos grants.

revoke execute on function public.seed_default_quote_statuses(uuid) from public;
revoke execute on function public.seed_default_work_item_statuses(uuid, uuid) from public;
revoke execute on function public.notify_missing_hours() from public;
revoke execute on function public.notify_overdue_work_items() from public;

grant execute on function public.seed_default_work_item_statuses(uuid, uuid) to authenticated;
