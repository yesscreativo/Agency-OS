-- Gap restante de la auditoría de seguridad (revisor externo "Codex", 2026-09-14):
-- `quote_versions.snapshot` (JSONB con `cost_price`/`client_price` de cada
-- ítem de la cotización, congelado en cada envío) era legible por REST directo
-- por cualquier miembro de la organización — la policy `quote_versions_select`
-- (003_rls.sql) solo exige membresía de organización, sin gate de permiso.
-- La UI nunca expone el snapshot crudo (`crm/[id]/page.tsx` solo manda el
-- `total`/`itemCount` ya calculado con el rol de precio correcto), pero el
-- bypass por REST seguía abierto — mismo patrón ya cerrado en `quote_items`
-- (047/048) y `supplier_orders` (049/050).
--
-- Mismo fix: revoke de tabla completa + grant de columna por columna a
-- `authenticated`, excluyendo `snapshot`. La lectura para calcular los totales
-- de versión y la escritura (al enviar la cotización) pasan a usar el cliente
-- service-role — ver crm/[id]/page.tsx y quote-actions.ts (sendQuote).

revoke select on public.quote_versions from anon, authenticated;

grant select (
  id, quote_id, version_number, created_by, created_at
) on public.quote_versions to authenticated;
