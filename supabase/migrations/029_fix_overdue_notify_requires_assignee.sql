-- Bug: el paso 3 de notify_overdue_work_items() marcaba overdue_notified_at
-- para TODA tarea vencida, sin exigir que tenga responsables — a diferencia del
-- paso 2 (INSERT), que sí usa un INNER JOIN con work_item_assignees. Efecto: una
-- tarea vencida sin responsables en el momento del cron queda marcada "avisada"
-- sin haber avisado a nadie y, por la idempotencia (overdue_notified_at is null
-- en el WHERE), nunca se reintenta aunque después se le asigne alguien. Se
-- alinea el filtro del UPDATE con el del INSERT.

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

  -- 3) Marcar como avisadas SOLO las que realmente tenían responsable (y por
  --    tanto generaron notificación arriba). Las sin responsable quedan sin
  --    marcar para reevaluarse el próximo día hasta que tengan uno.
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
    ) = false
    and exists (select 1 from public.work_item_assignees a where a.work_item_id = t.id);
end;
$$;
