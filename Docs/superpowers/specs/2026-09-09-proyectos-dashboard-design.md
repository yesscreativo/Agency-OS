# Dashboard de /proyectos — Diseño

**Fecha:** 2026-09-09
**Estado:** nuevo spec
**Objetivo:** convertir la raíz `/proyectos` (hoy solo la lista de proyectos) en un dashboard que ayude a cada usuario a organizar su semana, sin depender de IA.

## Contexto

El rediseño de Proyectos (2026-07-30/31) dejó pendiente "H2": convertir `/proyectos` en dashboard con saludo, tareas de hoy, tiempo, atención y una recomendación de "por dónde empezar". En ese momento varios de esos bloques eran placeholders porque time tracking y Áreas/Cargos ("Mi área") todavía no existían.

Al retomarlo (2026-09-09), con time tracking y Mi área ya construidos y validados, se re-discutió el alcance con Yesid en vez de ejecutar el diseño viejo tal cual:
- "Tiempo hoy" ya no es una métrica de minutos registrados (eso ya lo cubre `/proyectos/tiempos`, "Mis tiempos"). Yesid pidió en su lugar una **recomendación de cómo organizar el día/semana** según prioridad y vencimientos — heurística determinista, sin IA (los agentes de IA del producto siguen en V2 según el roadmap).
- Esa recomendación se fusiona con el bloque "Mis tareas de hoy" y "Por dónde empezar" del diseño original: los tres eran, en esencia, la misma necesidad.
- "Carga del equipo" ya no es un placeholder — vive completa en `/mi-area` (solo gerentes de área). El dashboard no la duplica, solo la resume.

## Objetivo

1. Al entrar a `/proyectos`, cualquier usuario ve de inmediato cuántas tareas tiene para hoy/mañana y cómo se reparte su semana, sin tener que abrir cada proyecto.
2. Las tareas sin fecha de vencimiento quedan visibles y accionables (asignarles fecha), en vez de perderse fuera de cualquier vista.
3. Las tareas vencidas se destacan como punto de atención, con un enlace directo a la carga del equipo si el usuario administra un área.
4. La lista de proyectos existente no se pierde ni se muda de URL — el dashboard se agrega arriba.

## Funcionalidades

### 1. Encabezado de saludo

- "Buenos días/tardes/noches, {nombre} · N para hoy · M vencen mañana" (según hora local del server; simple, sin zona horaria por usuario).
- N y M cuentan tareas/subtareas asignadas al usuario, no completadas, con `due_date` = hoy / = mañana respectivamente.

### 2. Agenda semanal (reemplaza "Mis tareas de hoy", "Tiempo hoy" y "Por dónde empezar" del diseño original)

- Grilla de **lunes a viernes** (5 columnas) de la semana actual (la semana del server, no configurable por el usuario en esta primera versión).
- Cada columna lista las tareas/subtareas asignadas al usuario con `due_date` en ese día, **ordenadas por la heurística** (ver Dominio) — no por orden de creación ni alfabético.
- Las tareas **vencidas** (`due_date` < hoy, todavía abiertas) se acumulan además al principio de la columna de "hoy", marcadas visualmente distintas (mismo tratamiento de "Retrasada" que ya usa `project-board.tsx`), para que no se pierdan de la planificación del día — y también cuentan en el bloque "Atención" (ver 3.4).
- Cada tarjeta de tarea en la agenda muestra: título, cliente/proyecto, prioridad, y minutos estimados si existen (`estimated_minutes`).
- Click en una tarjeta navega al detalle de la tarea (mismo `taskHref` que usa el resto de la app).

### 3. Sidebar "Sin fecha"

- Lista aparte (fuera de la grilla) con las tareas/subtareas asignadas al usuario que **no tienen `due_date`**, para que las revise y les asigne una.
- Cada fila tiene un date-picker inline; al elegir fecha se guarda con la action existente `saveWorkItem` (reenviando `id`, `projectId`, `title` y demás campos ya conocidos de la tarea, solo cambiando `dueDate`) — no se crea una action nueva.
- Al asignar fecha, la tarea desaparece del sidebar y aparece en la columna correspondiente tras el refresh (mismo patrón `router.refresh()` que el resto del módulo).

### 4. Bloque "Atención"

- Contador real de tareas vencidas del usuario (mismas que se destacan en la agenda, sección 2).
- Si el usuario administra al menos un área (`listAreasManagedBy`), un resumen corto de carga del equipo de esa área — ej. "3 personas con más de 5 tareas abiertas" — calculado con `countOpenTasksByAssignee` sobre los miembros del área (`listPeopleInArea`), con un umbral fijo simple (>5 tareas abiertas cuenta como "carga alta"; no configurable en esta v0).
- El resumen es solo texto + un link a `/mi-area` para el detalle completo — no se duplica la tabla de "Mi área" acá.
- Si el usuario no administra ningún área, este bloque no muestra la parte de equipo (solo el contador de vencidas).

## Reglas

- Alcance de "mis tareas": work items tipo `task` o `subtask`, no borrados, no en estado `is_done`, con el usuario actual entre sus `work_item_assignees` — sin importar a qué proyecto/cliente pertenezcan.
- La agenda es **hacia adelante**: no intenta ubicar tareas sin fecha en huecos de la semana ni reordena fechas ya puestas por el usuario. La única "inteligencia" es el orden dentro de cada columna y la clasificación en los tres grupos (vencidas / esta semana / sin fecha).
- Quitar/asignar fecha desde el sidebar requiere los mismos permisos que editar la tarea hoy (`project.manage`, vía `saveWorkItem`) — no se relaja ni se amplía el control de acceso existente para esta feature.
- La lista de proyectos actual de `/proyectos` (componente `ProjectsList`) se mantiene sin cambios, debajo del dashboard nuevo, misma URL.

## Dominio (`packages/domain`)

- `agenda.ts`: `rankAgendaTasks<T extends { priority: WorkItemPriority; estimatedMinutes: number | null }>(tasks: T[]): T[]` — devuelve una copia del array ya ordenado (no muta el original, no devuelve índices). Orden determinista: 1) prioridad (`urgent` > `high` > `normal` > `low`), 2) duración estimada ascendente (las cortas primero, para generar impulso), tareas sin estimado al final del grupo de su prioridad. Función pura, sin acceso a datos, con tests (empate de prioridad, sin estimado, lista vacía, todas iguales).

## Repos (`packages/db`)

- `listMyAgenda(db, { organizationId, userId, weekStart, weekEnd, today }): { overdue: AgendaTask[]; byDate: Record<string, AgendaTask[]>; undated: AgendaTask[] }` — nueva función en `work-items.ts`, filtra por asignado (join `work_item_assignees`), no borrado, no `is_done` (embed de status desambiguado igual que `countOverdueTasksInProjects`). `AgendaTask` incluye lo necesario para la tarjeta: `id`, `title`, `priority`, `dueDate`, `estimatedMinutes`, `projectId`, nombre de cliente/proyecto.
- Reuso sin cambios: `countOpenTasksByAssignee` (carga del equipo), `listAreasManagedBy` + `listPeopleInArea` (para saber si el usuario administra un área y quiénes son sus miembros).

## Server / página

- `apps/web/app/(app)/proyectos/page.tsx` se amplía: además de lo que ya carga (proyectos, clientes), llama a `listMyAgenda` y, si el usuario administra áreas, a `countOpenTasksByAssignee` sobre los miembros de esas áreas. Arma greeting counts (hoy/mañana) a partir de `listMyAgenda`, sin queries adicionales.
- No se crean server actions nuevas: la única escritura (asignar fecha desde el sidebar) reusa `saveWorkItem`.

## UI

- Nuevo componente `apps/web/components/proyectos/projects-dashboard.tsx`, montado arriba de `<ProjectsList>` en `page.tsx`. Estructura interna: saludo (texto simple) → agenda semanal (grilla 5 columnas + sidebar "Sin fecha" al costado, mismo tratamiento visual `rounded-lg border border-line bg-glass` del resto del módulo) → bloque "Atención".
- Tarjeta de tarea en la agenda: variante compacta de la tarjeta Kanban existente (mismos badges de prioridad/retrasada que `project-board.tsx`, sin drag&drop).

## Fuera de alcance

- Recomendación generada por IA/OpenAI — decisión explícita de Yesid (2026-09-09): heurística determinista v0, sin costo ni latencia de API. Se revisa si hace falta IA cuando el producto llegue a esa fase (V2, ver `Docs/75-AI/Roadmap-AI.md`).
- Auto-asignar fecha a tareas sin `due_date` (la heurística no decide fechas, solo orden y agrupación).
- Semana configurable (elegir otra semana, navegar adelante/atrás) — v0 muestra siempre la semana actual del server.
- Sábado/domingo en la grilla.
- Vista semanal tipo agenda para "Mi área"/gerentes (el resumen de carga del equipo es solo un contador + link, no una vista nueva).
- Buscador global ni "Nueva tarea" en la top bar (eso es H3 del rediseño original, aparte).

## Dependencias

- `packages/db/src/repositories/work-items.ts` (`countOverdueTasksInProjects`, `countOpenTasksByAssignee`, patrón de embed desambiguado `!work_items_status_fk`) — se extiende, no se reescribe.
- `packages/db/src/repositories/areas.ts` (`listAreasManagedBy`, `listPeopleInArea`).
- `apps/web/lib/project-actions.ts` (`saveWorkItem`) — se reusa tal cual para el date-picker del sidebar.
- `apps/web/components/proyectos/project-board.tsx` — referencia visual para badges de prioridad/retrasada.
- `apps/web/app/(app)/proyectos/page.tsx` y `components/proyectos/projects-list.tsx` — se extiende la página, no se reescribe la lista.

## Resultado esperado

Al entrar a `/proyectos`, el usuario ve cuántas tareas tiene para hoy y mañana, su semana organizada por prioridad en una agenda de lunes a viernes, y un lugar único para poner fecha a las tareas que todavía no la tienen. Las tareas vencidas quedan visibles como punto de atención, y quien administra un área ve de un vistazo si su equipo está sobrecargado, con acceso directo al detalle en Mi área.
