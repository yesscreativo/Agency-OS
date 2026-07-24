-- Separa la gestión de KAM/PM (propia del CRM) del acceso general del sistema,
-- y aprovisiona automáticamente people/users al crear una cuenta de auth
-- (invitación manual o login con Google), solo para el dominio de la agencia.

insert into public.permissions (code, name, description) values
  ('kam.manage', 'Gestionar KAM/PM', 'Crear, renombrar y activar/desactivar el catálogo de KAM/PM del CRM.');

-- Evita el choque de nombre con el rol de sistema "Administrador" (is_super)
-- en el selector de la sección general de Usuarios.
update public.roles set name = 'Administrador CRM' where code = 'crm_admin';

-- crm_admin gestiona su propio catálogo de KAM/PM, no el acceso general del sistema.
delete from public.role_permissions
where role_id = (select id from public.roles where code = 'crm_admin')
  and permission_id = (select id from public.permissions where code = 'users.manage');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'crm_admin' and p.code = 'kam.manage';

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'administrador' and p.code = 'kam.manage';

drop policy if exists kams_write on public.kams;
create policy kams_write on public.kams
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('kam.manage')
  );

-- Un usuario puede editar su propia fila de people (Mi perfil), además de
-- quien tenga people.manage (policy people_write ya existente, se suman).
create policy people_self_update on public.people
  for update using (
    id in (select person_id from public.users where id = auth.uid())
  );

-- Aprovisiona people/users al crear una cuenta en auth.users, solo si el
-- correo es del dominio de la agencia. Cubre invitación manual y OAuth
-- (Google); la persona queda sin roles ("Pendiente") hasta que un
-- Administrador de sistema le asigne módulo + rol.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_email text := new.email;
  v_full_name text := coalesce(
    new.raw_user_meta_data ->> 'full_name',
    new.raw_user_meta_data ->> 'name',
    split_part(coalesce(v_email, ''), '@', 1)
  );
  v_person_id uuid;
begin
  if v_email is null or v_email !~* '@laburuagencia\.com$' then
    return new;
  end if;

  select id into v_org_id from public.organizations order by created_at limit 1;
  if v_org_id is null then
    return new;
  end if;

  insert into public.people (organization_id, full_name, email)
  values (v_org_id, v_full_name, v_email)
  on conflict (organization_id, email) do update set full_name = excluded.full_name
  returning id into v_person_id;

  insert into public.users (id, person_id)
  values (new.id, v_person_id)
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();
