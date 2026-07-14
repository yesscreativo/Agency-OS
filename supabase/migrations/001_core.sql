-- Extensiones y helpers
create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- organizations: tenant de la agencia (Core de la spec, distinto de la empresa del cliente)
create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  code text unique,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- people: identidad de cualquier persona (staff interno o contacto), con o sin login
create table public.people (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  full_name text not null,
  email text,
  phone text,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, email)
);

-- users: extiende auth.users 1:1, vincula la persona con su cuenta de acceso
create table public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  person_id uuid not null references public.people(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  primary key (role_id, permission_id)
);

-- asignación de rol, siempre acotada a una organización (multi-tenant)
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, role_id, organization_id)
);

create trigger trg_organizations_updated_at before update on public.organizations
  for each row execute function public.set_updated_at();
create trigger trg_people_updated_at before update on public.people
  for each row execute function public.set_updated_at();
create trigger trg_users_updated_at before update on public.users
  for each row execute function public.set_updated_at();
create trigger trg_roles_updated_at before update on public.roles
  for each row execute function public.set_updated_at();

create index idx_people_organization_id on public.people(organization_id);
create index idx_user_roles_user_id on public.user_roles(user_id);
create index idx_user_roles_organization_id on public.user_roles(organization_id);

-- helpers RLS (ahora que user_roles existe)
create or replace function public.current_user_organization_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select organization_id from public.user_roles where user_id = auth.uid();
$$;

create or replace function public.current_user_has_permission(perm_code text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    where ur.user_id = auth.uid() and p.code = perm_code
  );
$$;
