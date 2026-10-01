-- 064_client_contacts.sql
-- Identidad de contactos de cliente (Portal Cliente), separada por completo
-- del RBAC interno (users/people/user_roles/roles). Ver
-- Docs/superpowers/specs/2026-10-01-portal-cliente-design.md.

create type public.client_contact_status as enum ('invited', 'active', 'disabled');

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  status public.client_contact_status not null default 'invited',
  invited_by uuid references public.users(id),
  invited_at timestamptz not null default now(),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_contacts_client_idx on public.client_contacts(client_id);

alter table public.client_contacts enable row level security;

-- Laburu (con permiso client.manage) gestiona contactos de cualquier cliente de su organización.
create policy client_contacts_staff_all on public.client_contacts
  for all using (
    exists (
      select 1 from public.clients c
      where c.id = client_contacts.client_id
        and c.organization_id in (select public.current_user_organization_ids())
    )
    and public.current_user_has_permission('client.manage')
  );

-- El propio contacto puede ver (no editar) su fila.
create policy client_contacts_self_select on public.client_contacts
  for select using (auth_user_id = auth.uid());

-- Helper análogo a current_user_organization_ids(), para RLS futura de
-- Tickets/Parrillas: null si el contacto no existe o está deshabilitado.
create or replace function public.current_client_contact_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.client_contacts
  where auth_user_id = auth.uid() and status = 'active';
$$;
