# Alerta de horas no registradas — Diseño

**Fecha:** 2026-09-11
**Estado:** nuevo spec
**Objetivo:** avisar automáticamente, el mismo día, cuando un colaborador de un área no ha registrado el mínimo de horas esperado — tanto al propio colaborador como al gerente del área — reutilizando el patrón ya probado de `notify_overdue_work_items()`.

## Contexto

`/mi-area` ya tiene un umbral configurable por área ("carga alta", `areas.overload_threshold`, en tareas abiertas) editable por el gerente ([[areas-cargos-mi-area]]). El time tracking (`work_item_time_entries`) ya registra minutos por usuario/día. Falta cruzar ambos: si un colaborador no llega al mínimo diario, nadie se entera hasta que alguien pregunta.

Decisiones tomadas con Yesid:
- El umbral de horas mínimas es **configurable por área**, igual que "carga alta" — cada gerente define su propio mínimo.
- Aplica a **todos** los colaboradores del área ese día, tengan o no tareas asignadas.
- Solo cuenta **lunes a viernes** (sin calendario de festivos en esta fase).
- El aviso corre **el mismo día**, a las 4pm hora Colombia (da tiempo a registrar antes de que termine la jornada) — hora fija, no configurable en v1.
- El gerente recibe **una sola notificación agrupada por día** con los nombres de quienes faltaron, no una por persona.

## Funcionalidades

### 1. Umbral configurable por área (`/mi-area`)
Junto al editor de "carga alta" ya existente, un campo nuevo: *"Alertar si registra menos de \_\_\_ horas al día"*. Mismo guard de dueño (`requireAreaManager`) y mismo patrón de UI que `OverloadThresholdEditor`.

### 2. Detección diaria (SQL + `pg_cron`)
Función `notify_missing_hours()`, `security definer`, agendada `0 21 * * 1-5` (21:00 UTC = 4pm Colombia, lun-vie):

1. Para cada área con colaboradores activos (`people.area_id`, `deleted_at is null`, con `users.person_id` resuelto — se ignoran personas sin cuenta):
   - Suma `work_item_time_entries.minutes` del usuario con `spent_on = current_date`.
   - Si la suma `< areas.min_daily_minutes` → esa persona "falta" hoy.
2. **Notificación al colaborador** (`type = 'hours_missing'`): título con horas registradas vs. mínimo, link a `/proyectos/tiempos`.
3. **Notificación agrupada al gerente** (`type = 'hours_missing_team'`), una por área/día, solo si hay al menos un colaborador faltante **distinto del propio gerente** (el gerente ya recibe su aviso personal si le aplica a él mismo). Si el área no tiene `manager_user_id`, se omite este paso.
4. Idempotencia: antes de insertar, se verifica que no exista ya una notificación de ese `type` para ese `user_id`/área con `created_at::date = current_date` (protege contra una segunda corrida manual el mismo día).

### 3. Notificaciones — contenido
- Colaborador: `"No registraste suficiente tiempo hoy (mínimo Xh, llevas Yh)."` → link `/proyectos/tiempos`.
- Gerente: `"N colaboradores no registraron tiempo hoy"` con los nombres en `body` → link `/mi-area`.

## Reglas

- El umbral vive en `areas.min_daily_minutes` (minutos, no horas) — la UI convierte horas↔minutos igual que el time tracking (`parseDuration`/`formatDuration` de `@agency-os/domain`).
- Personas sin cuenta de usuario (`userId: null`, invitación pendiente) se excluyen del chequeo — no pueden registrar tiempo ni recibir notificaciones.
- Áreas sin gerente: se notifica igual al colaborador; se omite el paso de notificación agrupada.
- El gerente nunca se incluye a sí mismo en la lista de nombres de su propia notificación agrupada.
- No hay noción de "tarea asignada ese día" — se evalúa a todo el equipo del área, coincida o no con carga de trabajo.
- Sin calendario de festivos: sábados y domingos no se evalúan; feriados entre semana sí generan alerta en esta fase.

## Modelo de datos

```sql
alter table public.areas
  add column min_daily_minutes integer not null default 480
  check (min_daily_minutes > 0);
```

Función + cron, mismo patrón que `026_overdue_work_items.sql` / `029_fix_overdue_notify_requires_assignee.sql`:

```sql
create or replace function public.notify_missing_hours()
returns void
language plpgsql
security definer
set search_path = public
as $$ ... $$;

create extension if not exists pg_cron;
select cron.unschedule('notify-missing-hours') from cron.job where jobname = 'notify-missing-hours';
select cron.schedule('notify-missing-hours', '0 21 * * 1-5', $$ select public.notify_missing_hours(); $$);
```

## Repos / acciones nuevas

- `packages/db/src/repositories/areas.ts`: `updateAreaMinDailyMinutes(db, id, minutes)`.
- `apps/web/lib/mi-area-actions.ts`: `updateAreaMinDailyMinutesAction(areaId, minutes)` — mismo guard/patrón que `updateAreaOverloadThresholdAction`.
- `apps/web/components/mi-area/min-daily-hours-editor.tsx` — mismo patrón que `OverloadThresholdEditor`, pero en horas (acepta decimales tipo "7.5") en vez de un entero de tareas.

## Fuera de alcance

- Hora del job configurable (fija a las 4pm Colombia).
- Calendario de festivos / vacaciones.
- Excluir del chequeo a quien no tenía tareas asignadas ese día.
- Notificar por email o cualquier canal fuera de la campana in-app.

## Resultado esperado

Laura (gerente de Diseño) configura el mínimo de su área en 6h/día. El jueves, dos de sus colaboradores no llegan a esas 6h. A las 4pm reciben cada uno su aviso personal, y Laura recibe una sola notificación: "2 colaboradores no registraron tiempo hoy", con sus nombres, y un link directo a `/mi-area`.
