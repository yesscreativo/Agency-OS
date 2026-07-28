-- 017_review_future_custom.sql
-- "Revisión a futuro" (review_future) deja de ser un estado de SISTEMA y pasa a ser
-- un estado CUSTOM: editable/borrable por organización desde /crm/estados. Se
-- reclasifica la fila existente y se quita del seed de sistema (las organizaciones
-- nuevas ya no lo crean automáticamente; es un estado que se agrega a mano si se
-- quiere). La guarda de estados de sistema bloquea cambiar is_system, así que se
-- deshabilita puntualmente para el UPDATE.

-- 1. Reclasificar filas existentes: system -> custom.
alter table public.quote_statuses disable trigger trg_guard_system_quote_status;
update public.quote_statuses set is_system = false where code = 'review_future';
alter table public.quote_statuses enable trigger trg_guard_system_quote_status;

-- 2. Quitar review_future del seed de sistema (espeja SYSTEM_QUOTE_STATUS_SEED del
--    paquete domain: ahora 8 estados de sistema).
create or replace function public.seed_default_quote_statuses(p_org uuid)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.quote_statuses
    (organization_id, code, label, color, is_solid, on_color, kind, sort_order, is_active, is_system)
  values
    (p_org, 'draft',         'Borrador',          '#9aa1ab', false, null,      'draft',     10, true, true),
    (p_org, 'sent',          'Enviada',           '#7eb8ff', false, null,      'sent',      30, true, true),
    (p_org, 'under_review',  'En revisión',       '#f5c95a', false, null,      'in_review', 40, true, true),
    (p_org, 'modified',      'Modificada',        '#8b5cf6', false, null,      'in_review', 50, true, true),
    (p_org, 'accepted',      'Aceptada',          '#86c99a', false, null,      'won',       60, true, true),
    (p_org, 'rejected',      'Rechazada',         '#e5675f', false, null,      'lost',      70, true, true),
    (p_org, 'purchased',     'Contrato firmado',  '#3bc9c9', false, null,      'won',       80, true, true),
    (p_org, 'closed',        'Cerrada',           '#1f8f4d', true,  '#ffffff', 'closed',    90, true, true)
  on conflict (organization_id, code) do nothing;
$$;
