create type public.quote_type as enum ('proyecto', 'evolutivo');

create type public.quote_status as enum (
  'draft', 'sent', 'under_review', 'modified', 'accepted',
  'rejected', 'purchased', 'closed', 'review_future'
);

create type public.quote_item_status as enum ('pending', 'accepted', 'rejected', 'changes');

create type public.supplier_order_status as enum ('pending', 'sent', 'confirmed');

-- clients: empresa cliente de la agencia (fusiona la vieja "organizations" del cotizador, que
-- en realidad describía a la empresa del cliente, no al tenant)
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text,
  name text not null,
  email text not null,
  phone text,
  company text,
  nit text,
  responsible text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text unique,
  client_id uuid not null references public.clients(id),
  status public.quote_status not null default 'draft',
  quote_type public.quote_type,
  quote_name text,
  message text,
  internal_notes text,
  created_by uuid references public.users(id),
  assigned_to uuid references public.users(id),
  clickup_task_id text,
  currency text not null default 'COP',
  event_date date,
  purchase_order text,
  invoice_number text,
  has_iva boolean not null default false,
  iva_percentage numeric(5,2) not null default 0,
  brief_url text,
  rejection_reason text,
  sent_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  description text not null,
  quantity integer not null default 1,
  client_price numeric(12,2) not null default 0,
  cost_price numeric(12,2) not null default 0,
  status public.quote_item_status not null default 'pending',
  client_comment text,
  sort_order integer not null default 0,
  supplier text,
  is_group boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- destinatarios del enlace público de cliente (magic link, expira a 5 días)
create table public.quote_recipients (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  name text not null,
  email text not null,
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  expires_at timestamptz not null default (now() + interval '5 days'),
  viewed_at timestamptz,
  client_comment text,
  created_at timestamptz not null default now()
);

create table public.quote_versions (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  version_number integer not null,
  snapshot jsonb not null,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (quote_id, version_number)
);

-- órdenes a proveedor por enlace público (expira a 30 días)
create table public.supplier_orders (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  supplier_name text not null,
  supplier_email text not null,
  items jsonb not null default '[]'::jsonb,
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  status public.supplier_order_status not null default 'pending',
  sent_at timestamptz,
  confirmed_at timestamptz,
  supplier_comment text,
  expires_at timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (quote_id, supplier_name)
);

-- contador atómico para la numeración MES+CLIENTE+DDMMAAAA-NN, evita la condición de
-- carrera del cotizador viejo (que calculaba el correlativo en JS)
create table public.quote_code_counters (
  client_id uuid not null references public.clients(id) on delete cascade,
  day date not null,
  last_seq integer not null default 0,
  primary key (client_id, day)
);

create or replace function public.next_quote_seq(p_client_id uuid, p_day date)
returns integer
language sql
as $$
  insert into public.quote_code_counters (client_id, day, last_seq)
  values (p_client_id, p_day, 1)
  on conflict (client_id, day)
  do update set last_seq = public.quote_code_counters.last_seq + 1
  returning last_seq;
$$;

create trigger trg_clients_updated_at before update on public.clients
  for each row execute function public.set_updated_at();
create trigger trg_quotes_updated_at before update on public.quotes
  for each row execute function public.set_updated_at();
create trigger trg_quote_items_updated_at before update on public.quote_items
  for each row execute function public.set_updated_at();
create trigger trg_supplier_orders_updated_at before update on public.supplier_orders
  for each row execute function public.set_updated_at();

create index idx_clients_organization_id on public.clients(organization_id);
create index idx_quotes_organization_id on public.quotes(organization_id);
create index idx_quotes_client_id on public.quotes(client_id);
create index idx_quotes_created_by_date on public.quotes(created_by, created_at desc);
create index idx_quotes_status_active on public.quotes(status)
  where status not in ('closed', 'rejected');
create index idx_quote_items_quote_id on public.quote_items(quote_id);
create index idx_quote_recipients_quote_id on public.quote_recipients(quote_id);
create index idx_quote_versions_quote_id on public.quote_versions(quote_id);
create index idx_supplier_orders_quote_id on public.supplier_orders(quote_id);
