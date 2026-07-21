-- 011_pending_users_visibility.sql
-- Un usuario recién provisionado (por invitación o login con Google) todavía no
-- tiene rol asignado ("Pendiente"). La política users_select original solo
-- mostraba usuarios con un rol en tu organización, así que los pendientes eran
-- INVISIBLES en /usuarios y nunca se les podía asignar el primer rol — rompía el
-- flujo de alta completo. Este arreglo:
--   1. Agrega el helper current_user_is_super() (no existía uno para RLS; el
--      bypass is_super hasta ahora vivía solo en la app).
--   2. Amplía users_select para que un Administrador de sistema (super) vea
--      también a los usuarios pendientes cuya persona pertenece a su organización
--      (el vínculo con la org lo pone el trigger de alta en people.organization_id).

create or replace function public.current_user_is_super()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.user_id = auth.uid() and r.is_super
  );
$$;

revoke execute on function public.current_user_is_super() from anon, public;
grant execute on function public.current_user_is_super() to authenticated;

drop policy if exists users_select on public.users;
create policy users_select on public.users
for select to authenticated
using (
  -- uno mismo
  id = auth.uid()
  -- usuarios con rol en alguna de mis organizaciones
  or exists (
    select 1
    from public.user_roles ur
    where ur.user_id = users.id
      and ur.organization_id in (select public.current_user_organization_ids())
  )
  -- pendientes (sin rol) de mi organización, visibles solo para el super admin
  or (
    public.current_user_is_super()
    and exists (
      select 1
      from public.people p
      where p.id = users.person_id
        and p.organization_id in (select public.current_user_organization_ids())
    )
  )
);
