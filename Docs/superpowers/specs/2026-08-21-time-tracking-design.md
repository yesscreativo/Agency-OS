# Time Tracking — Diseño (Proyectos / Work Items, Fase C)

## Objetivo

Permitir que los colaboradores registren el tiempo que dedican a cada tarea (work item), de forma **sumable y atribuida a quien lo registra**, y que la Dirección vea cuánto tiempo se invirtió por colaborador y por proyecto/tarea. Es la Fase C del módulo de Proyectos (reemplazo de ClickUp) y de él cuelgan reportes de carga/capacidad futuros.

Contexto: la fila "Registrar el tiempo" ya existe como placeholder en el detalle de la tarea (`work-item-fields-panel.tsx`). El módulo ya tiene duración estimada (`work_items.estimated_minutes`) y helpers `formatDuration`/`parseDuration` en `@agency-os/domain`.

## Funcionalidades

### Registro de tiempo
- **Manual**: el colaborador añade una entrada con duración (`2h 30m`, vía `parseDuration`), fecha del día trabajado (`spent_on`, default hoy) y nota opcional.
- **Cronómetro en vivo**: botón Iniciar/Detener. Un solo cronómetro activo por usuario a la vez (estilo ClickUp); iniciar uno nuevo **auto-detiene** el anterior (crea su entrada). Al detener se calcula la duración y se crea una entrada `source='timer'`.
- Cada entrada queda **atribuida a quien la registró** (`user_id`).

### Visualización en la tarea
- La fila "Registrar el tiempo" muestra el **total** de la tarea (`formatDuration`) + acciones **▷ Iniciar** y **＋ Agregar**.
- Con un cronómetro corriendo, la fila muestra el tiempo en curso y **⏹ Detener**.
- **Desglose por colaborador**: lista con avatar + nombre + total de cada persona ("Ana 3h · Yesid 1h 30m").

### Reportes
- **Proyecto**: tiempo total del proyecto, tiempo por tarea (columna en la vista Lista) y por colaborador.
- **Panel `/proyectos/tiempos`** (desde los placeholders del sidebar "Mis tiempos" / "Carga del equipo"):
  - **Mis tiempos** (cualquier miembro): mis entradas agrupadas por proyecto/tarea, filtrable por rango de fechas.
  - **Tiempos del equipo** (solo `project.manage`): totales por colaborador, filtrable por proyecto y rango de fechas.

### Actividad
- Registrar tiempo añade un evento `time_logged` a la actividad de la tarea (reusa `recordActivity` de `work_item_activity`, migración 023).

## Modelo de datos

### Tabla `work_item_time_entries` (entradas finalizadas)
| Columna | Tipo | Notas |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `organization_id` | uuid NOT NULL | FK organizations; scope RLS |
| `work_item_id` | uuid NOT NULL | FK work_items on delete cascade (la tarea/subtarea) |
| `project_id` | uuid NOT NULL | denormalizado (= work_item.project_id) para agregación/RLS de reportes |
| `user_id` | uuid NOT NULL | FK users; quién registró |
| `minutes` | int NOT NULL | `check (minutes > 0)` |
| `spent_on` | date NOT NULL | día trabajado; default `current_date` |
| `note` | text NULL | opcional |
| `source` | text NOT NULL | `'manual' \| 'timer'` (`check`) |
| `created_at` / `updated_at` | timestamptz | |

Índices: `(work_item_id)`, `(project_id)`, `(user_id, spent_on)`.

### Tabla `work_item_active_timers` (cronómetros corriendo)
| Columna | Tipo | Notas |
|---|---|---|
| `user_id` | uuid PK | FK users; un solo timer activo por usuario |
| `organization_id` | uuid NOT NULL | scope RLS |
| `work_item_id` | uuid NOT NULL | FK work_items on delete cascade |
| `started_at` | timestamptz NOT NULL | default `now()` |

Los minutos del cronómetro se calculan al detener: `round((now() - started_at)/60)`; si es 0 se descarta (no crea entrada).

## Reglas

### Permisos (RLS, patrón de `023_work_item_comments`)
- **Ver** (`select`): `organization_id in current_user_organization_ids()` (se asume `project.view` a nivel de módulo, igual que comentarios/actividad).
- **Registrar** (`insert`): miembro de la org **y** `user_id = auth.uid()` (solo registras lo tuyo).
- **Editar/borrar** (`update`/`delete`): `user_id = auth.uid()` **o** `current_user_has_permission('project.manage')` (el Director corrige/borra cualquiera).
- `active_timers`: cada quien gestiona el suyo (`user_id = auth.uid()`); insert/update/delete acotados a la propia fila.

### Server actions (`apps/web/lib/time-tracking-actions.ts`)
- `addTimeEntry({ workItemId, minutes, spentOn, note })` — valida `project.view` + minutos>0; deriva `project_id`/`organization_id` del work item; registra actividad `time_logged`.
- `editTimeEntry({ id, minutes, spentOn, note })` / `deleteTimeEntry(id)` — dueño o `project.manage`.
- `startTimer(workItemId)` — auto-detiene el timer activo previo (crea su entrada) y crea el nuevo.
- `stopTimer()` — calcula minutos, crea entrada `source='timer'`, borra el active timer.
- `getActiveTimer()` — timer corriendo del usuario (para hidratar la UI).
- Guardas de organización a nivel de acción (los repos no filtran por org), igual que `project-actions.ts`.

### Repos (`packages/db/src/repositories/work-item-time.ts`)
- `insertTimeEntry`, `updateTimeEntry`, `deleteTimeEntry`, `getTimeEntry`.
- `listTimeEntries(db, workItemId)` — entradas de una tarea con autor embebido (nombre + avatar), orden cronológico.
- `sumByUserForWorkItem(db, workItemId)` — total por colaborador de una tarea.
- `sumByTaskForProject(db, projectId)` / `sumByUserForProject(db, projectId)` — agregados de proyecto.
- `reportEntries(db, { organizationId, userId?, projectId?, from?, to? })` — para el panel de tiempos (Mis tiempos / equipo).
- `getActiveTimer`, `upsertActiveTimer`, `deleteActiveTimer`.

### Dominio (`@agency-os/domain`)
- Reusar `formatDuration`/`parseDuration` (ya existen; días no soportados, sigue igual).
- `sumMinutes(entries)` y helper de agrupación por usuario si aplica (puros, con tests).

## Flujo

1. Colaborador abre la tarea → ve total + desglose + acciones.
2. **Manual**: ＋ Agregar → mini-form → `addTimeEntry` → refresh (total y desglose actualizados) + evento de actividad.
3. **Cronómetro**: ▷ Iniciar → `startTimer` (auto-stop del previo) → la fila muestra el tiempo corriendo (contador en cliente desde `started_at`) → ⏹ Detener → `stopTimer` crea la entrada.
4. **Reportes**: la vista Lista del proyecto muestra tiempo por tarea; `/proyectos/tiempos` agrega por colaborador / proyecto / fechas.

## Entrega por fases (una sola spec, plan por fases)
1. **Fase 1** — migración (`work_item_time_entries` + RLS) + registro **manual** + total y desglose por colaborador en la tarea + evento de actividad `time_logged` + repos/actions base + dominio.
2. **Fase 2** — **cronómetro** en vivo (`work_item_active_timers`, start/stop, auto-stop, contador en cliente, hidratación de timer activo).
3. **Fase 3** — **reportes**: total de tiempo en el proyecto + columna en la vista Lista + panel `/proyectos/tiempos` (Mis tiempos / Tiempos del equipo con filtros de proyecto y rango de fechas).

## Configuración
- Migración nueva **027** (última actual = 026). Aplicar al remoto `hicbkpwywwhnhiawulmu` vía MCP.
- Regenerar tipos de `packages/db/src/types/database.ts` para las dos tablas nuevas.
- No requiere nuevos permisos: reusa `project.view` (registrar/ver) y `project.manage` (editar/borrar ajenos, ver equipo).

## KPIs / éxito
- Un colaborador puede registrar tiempo (manual y con cronómetro) y ver el total de la tarea crecer, atribuido a él.
- La Dirección ve, por proyecto y por colaborador, cuánto tiempo se invirtió, filtrable por fechas.
- Consistencia: totales de tarea = suma de sus entradas; total de proyecto = suma de entradas de sus tareas.

## Fuera de alcance (V2+)
- Facturación / tarifas por hora.
- Aprobación de tiempos (workflow de revisión).
- Reportes de capacidad/carga con vacaciones (dependen del módulo RRHH, inexistente) — este time tracking es la señal que los habilitará.
- Edición de un cronómetro en curso (solo iniciar/detener); el ajuste se hace sobre la entrada resultante.
