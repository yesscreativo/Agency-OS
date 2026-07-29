-- Notificaciones dentro de la plataforma + trazabilidad para dirigirlas.
-- Se disparan cuando el cliente responde, un proveedor confirma o cambia el
-- estado de una cotización. Destinatarios: quien la envió (sent_by) y el usuario
-- vinculado al KAM/PM asignado (kams.user_id).

-- 1. Trazabilidad -----------------------------------------------------------
-- Quién envió la cotización al cliente (se sella en sendQuote).
alter table public.quotes
  add column if not exists sent_by uuid references public.users(id);

-- Vincula un KAM/PM del catálogo a una cuenta de usuario (para poder notificarlo).
alter table public.kams
  add column if not exists user_id uuid references public.users(id);

-- 2. Tabla de notificaciones ------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null, -- 'client_response' | 'supplier_confirmed' | 'status_change'
  quote_id uuid references public.quotes(id) on delete cascade,
  title text not null,
  body text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- Índice para "mis no leídas, más recientes primero".
create index notifications_user_unread_idx
  on public.notifications (user_id, read_at, created_at desc);

-- 3. RLS --------------------------------------------------------------------
-- Cada quien ve y marca como leídas SOLO las suyas. Los INSERT se hacen con
-- service_role (flujo público sin sesión y emisión server-side), por eso no hay
-- policy de insert para authenticated.
alter table public.notifications enable row level security;

create policy notifications_select on public.notifications
  for select to authenticated
  using (
    user_id = auth.uid()
    and organization_id in (select public.current_user_organization_ids())
  );

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
