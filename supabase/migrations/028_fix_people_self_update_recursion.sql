-- Bug: people_self_update (010) consulta users, y users_select (011) consulta
-- people de vuelta para mostrar "Pendientes" al super admin. Postgres detecta el
-- ciclo people -> users -> people y aborta con 42P17 (infinite recursion) en
-- cualquier UPDATE sobre people hecho por el propio dueño (avatar y nombre en
-- /perfil). Se rompe la cadena con un helper security definer, mismo patrón que
-- current_user_is_super() (011): la función corre con los privilegios del owner
-- de la tabla, así que su consulta a `users` no vuelve a evaluar RLS.

create or replace function public.current_user_person_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select person_id from public.users where id = auth.uid();
$$;

revoke execute on function public.current_user_person_id() from anon, public;
grant execute on function public.current_user_person_id() to authenticated;

drop policy if exists people_self_update on public.people;
create policy people_self_update on public.people
  for update using ( id = public.current_user_person_id() );
