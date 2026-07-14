alter table public.organizations enable row level security;
alter table public.people enable row level security;
alter table public.users enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.clients enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;
alter table public.quote_recipients enable row level security;
alter table public.quote_versions enable row level security;
alter table public.supplier_orders enable row level security;
alter table public.quote_code_counters enable row level security;

-- organizations: solo ver las propias
create policy organizations_select on public.organizations
  for select using (id in (select public.current_user_organization_ids()));

-- roles/permissions/role_permissions: catálogo de solo lectura para cualquier autenticado
create policy roles_select on public.roles for select using (auth.role() = 'authenticated');
create policy permissions_select on public.permissions for select using (auth.role() = 'authenticated');
create policy role_permissions_select on public.role_permissions for select using (auth.role() = 'authenticated');

-- people
create policy people_select on public.people
  for select using (organization_id in (select public.current_user_organization_ids()));
create policy people_write on public.people
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('people.manage')
  );

-- users: tu propia fila, o cualquiera de tu organización
create policy users_select on public.users
  for select using (
    id = auth.uid()
    or exists (
      select 1 from public.user_roles ur
      where ur.user_id = public.users.id
        and ur.organization_id in (select public.current_user_organization_ids())
    )
  );

-- user_roles: tus propias asignaciones, o gestionadas por quien tiene el permiso
create policy user_roles_select on public.user_roles
  for select using (organization_id in (select public.current_user_organization_ids()));
create policy user_roles_write on public.user_roles
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('users.manage')
  );

-- clients
create policy clients_select on public.clients
  for select using (organization_id in (select public.current_user_organization_ids()));
create policy clients_write on public.clients
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('client.manage')
  );

-- quotes
create policy quotes_select on public.quotes
  for select using (organization_id in (select public.current_user_organization_ids()));
create policy quotes_insert on public.quotes
  for insert with check (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('quote.create')
  );
create policy quotes_update on public.quotes
  for update using (
    organization_id in (select public.current_user_organization_ids())
    and (public.current_user_has_permission('quote.update') or created_by = auth.uid())
  );

-- tablas hijas de quotes: heredan el alcance vía join
create policy quote_items_select on public.quote_items
  for select using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_items.quote_id
        and q.organization_id in (select public.current_user_organization_ids())
    )
  );
create policy quote_items_write on public.quote_items
  for all using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_items.quote_id
        and q.organization_id in (select public.current_user_organization_ids())
        and public.current_user_has_permission('quote.update')
    )
  );

create policy quote_recipients_select on public.quote_recipients
  for select using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_recipients.quote_id
        and q.organization_id in (select public.current_user_organization_ids())
    )
  );
create policy quote_recipients_write on public.quote_recipients
  for all using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_recipients.quote_id
        and q.organization_id in (select public.current_user_organization_ids())
        and public.current_user_has_permission('quote.update')
    )
  );

create policy quote_versions_select on public.quote_versions
  for select using (
    exists (
      select 1 from public.quotes q
      where q.id = quote_versions.quote_id
        and q.organization_id in (select public.current_user_organization_ids())
    )
  );

create policy supplier_orders_select on public.supplier_orders
  for select using (
    exists (
      select 1 from public.quotes q
      where q.id = supplier_orders.quote_id
        and q.organization_id in (select public.current_user_organization_ids())
    )
  );
create policy supplier_orders_write on public.supplier_orders
  for all using (
    exists (
      select 1 from public.quotes q
      where q.id = supplier_orders.quote_id
        and q.organization_id in (select public.current_user_organization_ids())
        and public.current_user_has_permission('quote.update')
    )
  );

-- Nota: quote_recipients/supplier_orders también se leen/escriben desde las vistas públicas
-- (magic link sin sesión). Esas rutas deben ir por API Routes server-side con la service_role
-- key (bypassa RLS), nunca exponiendo el token al cliente anon de Supabase directamente.
