-- ROLLBACK de emergencia: 045_quote_items_price_masking.sql revocó SELECT de
-- quote_items para anon/authenticated asumiendo que quote_items_secure
-- (security_invoker=true) podría leer la tabla base en su nombre. Postgres NO
-- funciona así: con security_invoker=true, los permisos sobre las columnas
-- REFERENCIADAS (incluso dentro de un CASE) se validan contra el rol que
-- INVOCA la vista, no el dueño — así que revocar de authenticated rompió el
-- acceso para TODOS, no solo para quien no debía ver el precio. Confirmado en
-- vivo contra el REST API real: "permission denied for table quote_items"
-- incluso para columnas no sensibles. Se restaura el acceso mientras se
-- rediseña con una función SECURITY DEFINER (047_quote_items_secure_rpc.sql),
-- que sí puede leer la tabla con los privilegios del dueño y aplicar el
-- enmascarado + el chequeo de organización a mano.

grant select on public.quote_items to authenticated;

drop view if exists public.quote_items_secure;
