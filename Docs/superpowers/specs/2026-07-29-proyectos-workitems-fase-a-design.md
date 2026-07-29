# Proyectos / Work Items — Fase A (core) — Diseño

**Fecha:** 2026-07-29 · **Rama:** `Feat/vista-publicas` (o rama nueva) · **Estado:** aprobado por
Yesid, pendiente su revisión del spec escrito.

## Contexto

El módulo de **Proyectos / Work Items** es el reemplazo de **ClickUp** dentro de Agency OS
(posicionamiento del pitch; competidores en `Docs/55-Research/Market-Analysis.md`). La visión
completa (Gantt, dependencias, plantillas, time tracking, tickets…) es demasiado para un solo
spec, así que se construye por fases. Esta es la **Fase A: el core del work item**, primer
entregable utilizable. Sigue al CRM, que ya está en `main`.

Fases posteriores (fuera de este spec): **B** colaboración (comentarios, adjuntos, checklists,
participantes, timeline) · **C** time tracking · **D** avanzado (Gantt, dependencias, hitos,
plantillas) · **Tickets** (otra cara del work_item: flujo SLA + Portal Cliente).

Hoy NO existe nada de work_items en el esquema `agency-os` (`hicbkpwywwhnhiawulmu`); se construye
desde cero. El modelo canónico previsto está en `Docs/70-Database/Tables.md` (`work_items`,
`comments`, `attachments`, `checklists`, `time_entries`).

## Decisiones (tomadas con Yesid)

1. **Estados por proyecto** (no un set global): cada proyecto define sus columnas de tablero,
   como ClickUp por lista. Al crear un proyecto se siembran por defecto: **Por hacer · En
   progreso · En revisión · Hecho** (editables por proyecto).
2. **Cliente obligatorio**: todo proyecto está atado a un cliente (`client_id` NOT NULL). No hay
   proyectos sin cliente; el trabajo interno del equipo son **tareas dentro de proyectos** de
   cada cliente (Laburu puede usar un cliente interno).
3. **Dos formas de crear proyecto**: (a) directo en `/proyectos` (se elige el cliente); (b)
   botón "Crear proyecto" desde una cotización **aceptada** (cliente prellenado, enlaza
   `quote_id`). Ambas llegan al mismo proyecto.
4. **Múltiples asignados** por work item (además del creador).
5. **Todo cuelga de un proyecto**: tarea/subtarea siempre tienen `project_id` (consistente y
   necesario para resolver estados).

## Modelo de datos (nuevo)

Enums: `work_item_type` (`project|task|subtask`), `work_item_priority`
(`low|normal|high|urgent`), `project_state` (`active|completed|archived`).

**`work_items`**
- `id` uuid PK · `organization_id` uuid NOT NULL
- `type` work_item_type NOT NULL
- `project_id` uuid NOT NULL → el proyecto dueño (para un row `project`, apunta a sí mismo o se
  maneja por convención; para task/subtask, su proyecto). Agrupa y resuelve estados.
- `parent_id` uuid NULL → self-ref (task.parent = project; subtask.parent = task)
- `title` text NOT NULL · `description` text NULL
- `status_id` uuid NULL → FK `work_item_statuses` (task/subtask); NULL en proyectos
- `project_state` project_state NULL → solo en proyectos (`active` por defecto)
- `priority` work_item_priority NOT NULL default `normal`
- `client_id` uuid NULL → FK `clients`; **NOT NULL efectivamente en proyectos** (se valida en
  la capa de datos/CHECK: `type='project'` ⇒ client_id no nulo)
- `quote_id` uuid NULL → FK `quotes` (solo si el proyecto vino de una cotización)
- `start_date` date NULL · `due_date` date NULL · `sort_order` int default 0
- `created_by` uuid NULL → `users`
- `created_at`/`updated_at` timestamptz · `deleted_at` timestamptz NULL (soft-delete)

**`work_item_statuses`** (columnas del tablero, por proyecto)
- `id` uuid PK · `organization_id` uuid NOT NULL · `project_id` uuid NOT NULL → `work_items`
- `label` text · `color` text (hex) · `sort_order` int · `is_done` bool default false
  (para calcular progreso) · timestamps
- Al crear un proyecto se siembran las 4 por defecto (trigger o en la acción de creación).

**`work_item_assignees`**
- `work_item_id` uuid → `work_items` · `user_id` uuid → `users` · PK compuesta ·
  `organization_id` para RLS.

**RLS**: habilitado en las 3 tablas, alcance por `organization_id` con los helpers existentes
(`current_user_organization_ids()`, `current_user_has_permission(code)`), mismo patrón que CRM.

## Vistas (`apps/web`, módulo `/proyectos`)

- **`/proyectos`** — lista de proyectos: nombre, cliente, nº de tareas, **progreso** (% tareas en
  estado `is_done`), estado de ciclo de vida. Buscador + su propia sub-nav (patrón del layout del
  CRM). Botón "Nuevo proyecto" (modal: cliente obligatorio + nombre).
- **`/proyectos/[id]`** — detalle del proyecto:
  - **Tablero Kanban** con columnas = `work_item_statuses` de *ese* proyecto; tarjetas de tarea
    (título, avatares de asignados, prioridad, fecha, contador de subtareas); drag&drop entre
    columnas (reusa el patrón de `kanban-board.tsx` del CRM). + vista **Lista** alterna.
  - **CRUD** tarea/subtarea, asignar múltiples usuarios, cambiar estado, prioridad, fechas.
  - **Administrar estados del proyecto** (versión ligera de `quote-status-manager.tsx`, por
    proyecto: crear/renombrar/recolorar/reordenar/marcar `is_done`).
- **Puente CRM**: botón "Crear proyecto" en `/crm/[id]` cuando la cotización está aceptada →
  crea el proyecto (client_id + quote_id, nombre prellenado) y redirige a `/proyectos/[id]`.

## Plataforma / RBAC

- Activar el módulo **`proyectos`** en la tabla `modules` (hoy inactivo). Aparece en `/inicio`
  (tarjeta) y en la nav; layout propio con sub-nav.
- Permisos nuevos: `project.view`, `project.manage` (crear/editar/borrar proyectos, tareas,
  estados), `project.assign` (asignar usuarios). Asignados a `administrador` (super, bypass) y a
  los roles que correspondan (definir en el plan). Gate de módulo por `module_code` + `is_super`,
  igual que el CRM.

## Repos / dominio (reutilización)

- `packages/db`: repos nuevos `work-items.ts`, `work-item-statuses.ts` siguiendo el patrón de
  `quotes.ts`/`quote-statuses.ts` (tipo `Db` inyectable, filtros, paginación interna por 1000).
- `packages/domain`: helpers puros para **progreso** del proyecto y validaciones (título
  requerido, jerarquía válida), con tests Vitest — patrón de `quote-stats.ts`/`quote-status.ts`.
- `packages/ui`: reusar Kanban/Card/Badge/Modal/Avatar existentes; agregar lo mínimo que falte.

## Reglas

- Un `task` tiene `parent_id` = un proyecto; un `subtask` tiene `parent_id` = una task; ambos
  heredan `project_id`.
- `status_id` de una tarea/subtarea debe pertenecer a `work_item_statuses` de su `project_id`
  (FK compuesta o validación en la acción).
- Progreso del proyecto = tareas (top-level) en estado `is_done` / total tareas.
- Borrado = soft-delete (`deleted_at`); borrar un proyecto oculta sus tareas/subtareas.

## Fuera de alcance (Fase A)

Comentarios, adjuntos, checklists, timeline (Fase B) · time tracking (C) · Gantt, dependencias,
hitos, plantillas (D) · Tickets/SLA/Portal Cliente · copiar ítems de cotización como tareas ·
notificaciones de asignación (se evalúan luego, reusando el centro de notificaciones del CRM).

## Verificación (end-to-end)

1. Migraciones aplicadas a `agency-os`; `turbo typecheck`/`lint`/tests de dominio verdes.
2. Playwright real (login `yesid.parra@`): crear proyecto directo (cliente obligatorio; bloquea
   sin cliente); crear proyecto desde una cotización aceptada (cliente prellenado, quote enlazada);
   crear tareas y subtareas; asignar 2+ usuarios; mover tarea entre columnas (persiste); editar
   los estados del proyecto (persisten tras recargar); progreso se actualiza; gating de módulo
   (usuario sin acceso no ve `/proyectos`). Tema claro y oscuro.
3. Validación manual de Yesid con checklist.
