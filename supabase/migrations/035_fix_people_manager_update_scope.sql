-- Corrige un hallazgo de seguridad de la migración 034: la policy
-- people_manager_update permitía al gerente de un área actualizar CUALQUIER
-- columna de las personas de su área (RLS no filtra por columna), no solo el
-- cargo como se pretendía — un manager podría, llamando a PostgREST
-- directamente (sin pasar por la server action de Next.js), cambiar
-- full_name/email/area_id/etc. de un colaborador de su área. Se reemplaza por
-- una función security definer que valida explícitamente la autorización y
-- que el cargo pertenezca a la misma área (equivalente al WITH CHECK
-- sugerido), y se quita la policy de UPDATE directa sobre people.

drop policy if exists people_manager_update on public.people;

create or replace function public.set_person_job_title(p_person_id uuid, p_job_title_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_area_id uuid;
  v_is_authorized boolean;
begin
  select area_id into v_area_id from public.people where id = p_person_id;
  if v_area_id is null then
    raise exception 'La persona no pertenece a ningún área.';
  end if;

  select public.current_user_is_super()
    or exists (select 1 from public.areas a where a.id = v_area_id and a.manager_user_id = auth.uid())
    into v_is_authorized;
  if not v_is_authorized then
    raise exception 'No administras el área de esta persona.';
  end if;

  if p_job_title_id is not null and not exists (
    select 1 from public.job_titles jt where jt.id = p_job_title_id and jt.area_id = v_area_id
  ) then
    raise exception 'El cargo no pertenece al área de esta persona.';
  end if;

  update public.people set job_title_id = p_job_title_id where id = p_person_id;
end;
$$;

revoke execute on function public.set_person_job_title(uuid, uuid) from anon, public;
grant execute on function public.set_person_job_title(uuid, uuid) to authenticated;
