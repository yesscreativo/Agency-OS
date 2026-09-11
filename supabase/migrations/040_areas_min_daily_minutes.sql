-- Alerta de horas no registradas: mínimo diario de minutos configurable por
-- área (mismo patrón que overload_threshold), y job diario que avisa al
-- colaborador y a su gerente cuando no llega al mínimo. Ver
-- Docs/superpowers/specs/2026-09-11-alerta-horas-no-registradas-design.md.

alter table public.areas
  add column min_daily_minutes integer not null default 480
  check (min_daily_minutes > 0);

-- Función que corre lun-vie a las 4pm hora Colombia (21:00 UTC, sin horario de
-- verano): por cada área, suma los minutos registrados HOY por cada
-- colaborador activo con cuenta de usuario; si no llega al mínimo, notifica al
-- colaborador y, agrupado, al gerente del área (sin incluirse a sí mismo en esa
-- lista — él ya recibe su propio aviso si le aplica). Idempotente: no reinserta
-- si ya existe una notificación de ese tipo hoy para ese destinatario/área.
-- security definer → corre como owner y evita la RLS de notifications, igual
-- que notify_overdue_work_items().
create or replace function public.notify_missing_hours()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  area record;
  missing_user_id uuid;
  missing_name text;
  missing_names text[];
begin
  for area in
    select a.id, a.organization_id, a.manager_user_id, a.min_daily_minutes
    from public.areas a
  loop
    missing_names := array[]::text[];

    for missing_user_id, missing_name in
      select u.id, p.full_name
      from public.people p
      join public.users u on u.person_id = p.id
      where p.area_id = area.id
        and p.deleted_at is null
        and coalesce((
          select sum(t.minutes)
          from public.work_item_time_entries t
          where t.user_id = u.id
            and t.spent_on = current_date
        ), 0) < area.min_daily_minutes
    loop
      -- Aviso individual al colaborador (si no se le avisó ya hoy).
      if not exists (
        select 1 from public.notifications n
        where n.user_id = missing_user_id
          and n.type = 'hours_missing'
          and n.created_at::date = current_date
      ) then
        insert into public.notifications (organization_id, user_id, type, title, body, link)
        values (
          area.organization_id,
          missing_user_id,
          'hours_missing',
          'No registraste suficiente tiempo hoy',
          'Mínimo esperado: ' || (area.min_daily_minutes / 60) || 'h'
            || (case when area.min_daily_minutes % 60 > 0
                  then ' ' || (area.min_daily_minutes % 60) || 'm' else '' end)
            || '.',
          '/proyectos/tiempos'
        );
      end if;

      if area.manager_user_id is null or missing_user_id <> area.manager_user_id then
        missing_names := array_append(missing_names, missing_name);
      end if;
    end loop;

    -- Aviso agrupado al gerente (si hay alguien más, aparte de él, que faltó).
    -- La notificación no tiene columna de área, así que la idempotencia se
    -- valida contra el mismo `body` (lista de nombres): un gerente de varias
    -- áreas puede recibir más de un aviso el mismo día si las listas difieren.
    if area.manager_user_id is not null and array_length(missing_names, 1) > 0
       and not exists (
         select 1 from public.notifications n
         where n.user_id = area.manager_user_id
           and n.type = 'hours_missing_team'
           and n.created_at::date = current_date
           and n.body = array_to_string(missing_names, ', ')
       )
    then
      insert into public.notifications (organization_id, user_id, type, title, body, link)
      values (
        area.organization_id,
        area.manager_user_id,
        'hours_missing_team',
        array_length(missing_names, 1) || ' colaborador' || (case when array_length(missing_names, 1) = 1 then '' else 'es' end) || ' no registró tiempo hoy',
        array_to_string(missing_names, ', '),
        '/mi-area'
      );
    end if;
  end loop;
end;
$$;

create extension if not exists pg_cron;

select cron.unschedule('notify-missing-hours')
from cron.job
where jobname = 'notify-missing-hours';

select cron.schedule(
  'notify-missing-hours',
  '0 21 * * 1-5',
  $$ select public.notify_missing_hours(); $$
);
