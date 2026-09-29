-- Fix de QA sobre 047: revocar SELECT de tabla completa en quote_items rompía
-- también la ESCRITURA para `authenticated` — Postgres exige privilegio SELECT
-- sobre las columnas referenciadas en un WHERE o un RETURNING de UPDATE/DELETE,
-- no solo en un SELECT puro. `replaceQuoteItems`/`setQuoteItemResponses` filtran
-- por `id`/`quote_id` y el upsert pedía `.select()` (todas las columnas) de
-- vuelta — con el revoke total, cualquier guardado de cotización fallaba con
-- "permission denied for table quote_items", confirmado en vivo simulando la
-- sesión de un usuario real.
--
-- Se reemplaza el revoke de tabla completa por uno a nivel de COLUMNA: se
-- otorga SELECT a `authenticated` sobre todo excepto `cost_price`/`client_price`
-- (que siguen bloqueadas — solo alcanzables vía `get_quote_items_secure`). Esto
-- deja pasar los WHERE/RETURNING de las escrituras legítimas sin reabrir la
-- lectura directa de los precios.

grant select (
  id, quote_id, description, quantity, status, client_comment,
  sort_order, supplier, is_group, created_at, updated_at, deleted_at
) on public.quote_items to authenticated;
