# Checklist en work items — Diseño

**Fecha:** 2026-09-08
**Estado:** nuevo spec
**Objetivo:** dar a cada tarea/subtarea una lista simple de pasos tipo casilla (✅), separada de las subtareas formales, que arma y tilda quien ejecuta el trabajo.

## Contexto

El spec de Fase B (`Docs/superpowers/specs/2026-08-05-clickup-parity-operacional-fase-b-design.md`, sección 3 "Checklists") quedó sin implementar cuando esa fase se dividió en slices (comentarios/actividad se hicieron, checklists no). Ese spec ya recomendaba una sola entidad `checklist_items` por work item, sin agrupar en checklists nombradas.

Al revisar pendientes con Yesid (2026-09-08) se confirmó retomar esto ahora, con un caso de uso concreto: una tarea como "Publicar post de Instagram — Cliente X" necesita pasos rápidos ("Diseñar pieza", "Revisión del cliente", "Programar en Meta") que no ameritan ser subtareas formales (sin responsable ni fecha propia), y que arma el propio ejecutor de la tarea al vuelo — no una plantilla compartida.

## Objetivo

1. Cada tarea o subtarea puede tener su propia checklist de pasos simples (una sola lista, sin agrupar).
2. El ejecutor (asignado a la tarea) puede armarla y tildarla aunque no tenga el permiso de gestión del proyecto — no depende de `project.manage`.
3. El progreso ("3/5") se ve tanto en el detalle de la tarea como en su tarjeta en tablero/lista, sin tener que entrar a cada una.
4. Agregar y completar ítems queda registrado en la Actividad de la tarea, igual que el resto de eventos.

## Funcionalidades

### 1. Checklist por work item (MVP)

#### Capacidad
- agregar ítems de texto libre a la checklist de una tarea o subtarea
- tildar/destildar ítems
- reordenar ítems (drag&drop)
- borrar ítems
- ver el progreso (completados/total)

#### Alcance funcional
- **una sola lista por work item**, sin checklists nombradas ni agrupación (a diferencia de lo que sugiere ClickUp con múltiples checklists por tarea) — decisión explícita para mantener el MVP simple; si más adelante hace falta agrupar, es una extensión aparte.
- aplica a tareas y subtareas por igual (mismo componente); no aplica a proyectos ni a tickets (no existen como work item independiente todavía).
- el progreso se muestra:
  - en el detalle de la tarea: header de la sección con "N/M" + barra de progreso fina.
  - en la tarjeta de tablero/lista (`project-board.tsx`): chip pequeño "N/M", solo si la tarea tiene al menos un ítem.

#### Reglas
- checklist no reemplaza subtareas — subtarea sigue siendo la unidad de trabajo formal (responsable, estado, fecha propia); checklist item es un paso ligero sin esos atributos.
- borrado de ítems es físico simple con `deleted_at` (soft delete), consistente con comentarios/adjuntos — no se expone forma de "restaurar" en el MVP.
- destildar un ítem no vuelve a exigir motivo ni confirmación; es una acción de 1 clic, igual que tildar.

### 2. Permisos

- **Lectura**: cualquier miembro de la organización con `project.view` sobre el proyecto (igual que el resto del work item).
- **Escritura** (agregar, tildar, destildar, reordenar, borrar): `project.manage` **o** ser uno de los asignados (`work_item_assignees`) de ese work item puntual. Así el ejecutor gestiona su propia checklist sin necesitar el permiso amplio de gestión del proyecto, y quien tiene `project.manage` puede intervenir en cualquier tarea.
- La regla de "asignado o `project.manage`" se aplica **en RLS**, no solo en la server action — una llamada directa a PostgREST (sin pasar por Next.js) queda igual de protegida.

### 3. Actividad

- Se registran dos tipos de evento en `work_item_activity`: `checklist_item_added` y `checklist_item_completed` (al tildar, no al destildar).
- **No** se registra actividad al destildar ni al borrar un ítem — evita ensuciar el timeline con ida y vuelta de checkboxes; el estado actual de la checklist ya es visible en la propia sección, no hace falta historial de cada toggle.

## Modelo de datos

Migración nueva (numerar contra la última migración remota real al momento de implementar; hoy sería `036_checklist_items.sql`, pero renumerar si hay otra migración concurrente, como ya pasó antes con 028→033).

```sql
create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  label text not null,
  sort_order integer not null default 0,
  is_completed boolean not null default false,
  completed_by uuid references public.users(id),
  completed_at timestamptz,
  created_by uuid not null references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- RLS: lectura = miembro de la org del work item (patrón existente vía
-- current_user_organization_ids() u organization_id directo).
-- Escritura = project.manage O EXISTS (work_item_assignees where
-- work_item_id = checklist_items.work_item_id and user_id = auth.uid()).
```

Campos siguen el esquema sugerido en el spec de Fase B (`label`, `sort_order`, `is_completed`, `completed_by`, `completed_at`, `created_by`, timestamps, `deleted_at`).

Se extiende además el `TASKS_SELECT` de `packages/db/src/repositories/work-items.ts` (usado por `getProject` y `getWorkItem`) con el embed `checklist_items:checklist_items(id, is_completed)` filtrado a `deleted_at is null` — así el conteo para el chip "N/M" viaja en la misma consulta que ya trae assignees/status, sin round-trip aparte.

## Dominio (`packages/domain`)

- `checklist.ts`: `checklistProgress(items: { is_completed: boolean }[]): { completed: number; total: number }`, con tests. Función pura, sin acceso a datos — consumida tanto por el detalle como por la tarjeta del tablero.

## Repos (`packages/db/src/repositories/checklist-items.ts`)

- `listChecklistItems(db, workItemId)` — ordenado por `sort_order`, excluye `deleted_at`.
- `insertChecklistItem(db, { organizationId, workItemId, label, createdBy })` — `sort_order` = máximo actual + 1.
- `toggleChecklistItem(db, id, completed, userId)` — setea `is_completed`, `completed_by`/`completed_at` (o los limpia si se destilda).
- `updateChecklistItemLabel(db, id, label)`.
- `deleteChecklistItem(db, id)` — soft delete (`deleted_at = now()`).
- `reorderChecklistItems(db, orderedIds: string[])` — batch update de `sort_order`, mismo patrón que `reorderProjectStatuses`.

## Server actions (`apps/web/lib/checklist-actions.ts`)

- `addChecklistItem(workItemId, label)`
- `toggleChecklistItemAction(id, completed)`
- `renameChecklistItemAction(id, label)`
- `deleteChecklistItemAction(id)`
- `reorderChecklistItemsAction(workItemId, orderedIds)`

Todas gatean `project.view` para resolver el work item, y luego `hasPermission(user, "project.manage")` **o** un chequeo `isAssigneeOfWorkItem(db, workItemId, user.id)` (query directa a `work_item_assignees`) antes de escribir. Sobre éxito, `addChecklistItem` y `toggleChecklistItemAction` (solo si `completed=true`) llaman a `recordActivity` con el evento correspondiente; el resto de acciones no generan actividad.

## UI

- Nueva sección "Checklist" en `work-item-detail.tsx`, ubicada entre "Descripción" y "Subtareas". Mismo estilo visual que esas secciones (`rounded-lg border border-line bg-glass p-6 backdrop-blur-xl`).
- Header: título "Checklist" + "N/M" a la derecha + barra de progreso fina debajo (ancho proporcional a `completed/total`; oculta si `total === 0`).
- Lista de ítems: checkbox + texto + botón de borrar que aparece al hover (mismo patrón que otras listas editables de la app). Reorder por drag&drop nativo (mismo mecanismo ya usado en `project-status-manager.tsx`).
- Input "+ Agregar ítem" al pie de la lista, Enter para confirmar y limpiar el campo; visible solo si el usuario puede escribir (`project.manage` o asignado).
- Si el usuario no puede escribir, se ve la lista en solo lectura (checkboxes deshabilitados, sin input ni botón de borrar).
- En `project-board.tsx`, la tarjeta de cada tarea/subtarea (vista Kanban y Lista) agrega un chip pequeño "N/M" junto a los indicadores existentes (badge de estado, prioridad), visible solo si `total > 0`.

## Fuera de alcance

- Checklists múltiples con nombre dentro de una misma tarea (agrupación tipo "Checklist de Diseño" / "Checklist de QA") — se evalúa como extensión futura si hace falta.
- Checklist obligatorio para poder mover la tarea a un estado `is_done` — no se bloquea el cambio de estado aunque queden ítems sin completar.
- Plantillas de checklist reutilizables entre tareas.
- Checklist en proyectos o en tickets — no existen como work item independiente todavía.
- Registro de actividad al destildar o borrar ítems (ver Reglas).
- Notificar a watchers/participantes por eventos de checklist — no existe el concepto de watcher todavía (sección 4 del spec de Fase B, aparte).

## Dependencias

- `Docs/superpowers/specs/2026-08-05-clickup-parity-operacional-fase-b-design.md` (spec original de la Fase B, sección 3).
- `packages/db/src/repositories/work-items.ts` (`TASKS_SELECT`, `getProject`, `getWorkItem`) — se extiende, no se reescribe.
- `apps/web/components/proyectos/work-item-detail.tsx` y `project-board.tsx` — se agregan secciones, sin romper las existentes.
- `apps/web/components/proyectos/project-status-manager.tsx` — referencia para el patrón de drag&drop reorder.
- `apps/web/lib/project-actions.ts` — referencia para el patrón de gate "autor/asignado o `project.manage`".

## Resultado esperado

Cualquier tarea o subtarea puede tener una checklist simple que arma y tilda quien la ejecuta, sin depender de tener permisos de gestión del proyecto. El progreso es visible de un vistazo en el tablero/lista, y queda registro en la Actividad de cuándo se agregó o completó cada paso.
