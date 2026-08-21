-- Tareas retrasadas: una tarea está retrasada cuando su fecha de vencimiento ya
-- pasó (due_date < hoy) y su estado NO es "hecho" (work_item_statuses.is_done).
-- Se avisa a los responsables con una notificación in-app, UNA sola vez por
-- lapso de retraso, mediante un job diario de pg_cron.

alter table public.work_items add column overdue_notified_at timestamptz;

-- Función que corre a diario: notifica a los responsables de las tareas recién
-- vencidas y marca la tarea como avisada. Es idempotente (no re-notifica) y se
-- auto-sana: si una tarea deja de estar vencida (se pospone o se marca hecha),
-- se limpia la marca para poder volver a avisar si vuelve a vencerse.
-- security definer → corre como owner y evita la RLS de notifications (igual que
-- el service_role del flujo de menciones).
create or replace function public.notify_overdue_work_items()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 1) Auto-sanado: limpiar la marca de las que ya no están vencidas.
  update public.work_items t
  set overdue_notified_at = null
  where t.overdue_notified_at is not null
    and (
      t.due_date is null
      or t.due_date >= current_date
      or coalesce(
        (select s.is_done from public.work_item_statuses s where s.id = t.status_id),
        false
      ) = true
    );

  -- 2) Notificar a los responsables de las tareas recién vencidas (sin avisar aún).
  --    El link usa los códigos cortos (8 hex) que resuelven la ruta canónica de la
  --    tarea; el segmento de cliente es cosmético (ver slug.ts).
  insert into public.notifications (organization_id, user_id, type, title, body, work_item_id, link)
  select t.organization_id,
         a.user_id,
         'overdue',
         'Tarea retrasada: "' || t.title || '"',
         'La fecha de vencimiento ya pasó.',
         t.id,
         '/proyectos/'
           || coalesce(left(replace(p.client_id::text, '-', ''), 8), 'x')
           || '/' || left(replace(t.project_id::text, '-', ''), 8)
           || '/tareas/' || left(replace(t.id::text, '-', ''), 8)
  from public.work_items t
  join public.work_item_assignees a on a.work_item_id = t.id
  left join public.work_items p on p.id = t.project_id
  where t.type in ('task', 'subtask')
    and t.deleted_at is null
    and t.due_date is not null
    and t.due_date < current_date
    and t.overdue_notified_at is null
    and coalesce(
      (select s.is_done from public.work_item_statuses s where s.id = t.status_id),
      false
    ) = false;

  -- 3) Marcar como avisadas (aunque no tengan responsables, para no reevaluar).
  update public.work_items t
  set overdue_notified_at = now()
  where t.type in ('task', 'subtask')
    and t.deleted_at is null
    and t.due_date is not null
    and t.due_date < current_date
    and t.overdue_notified_at is null
    and coalesce(
      (select s.is_done from public.work_item_statuses s where s.id = t.status_id),
      false
    ) = false;
end;
$$;

-- Programar el job: cada día a las 13:00 UTC (~8:00 en Colombia, UTC-5).
create extension if not exists pg_cron;

select cron.unschedule('notify-overdue-work-items')
from cron.job
where jobname = 'notify-overdue-work-items';

select cron.schedule(
  'notify-overdue-work-items',
  '0 13 * * *',
  $$ select public.notify_overdue_work_items(); $$
);
