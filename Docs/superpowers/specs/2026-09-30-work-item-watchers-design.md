# Watchers/seguidores de tareas — Diseño

**Fecha:** 2026-09-30
**Estado:** nuevo spec
**Objetivo:** permitir que alguien siga una tarea sin ser responsable (típico de un PM/cuentas), recibiendo notificación de comentarios y cambios de estado sin aparecer como asignado.

## Contexto

Gap real confirmado en la auditoría de ClickUp (`Docs/30-Functional/ClickUp-Parity.md`, sección 3, punto 1): una tarea con 3 asignados tenía 6 watchers; otra con 1 asignado tenía 3. Es gente que sigue una tarea sin ser responsable de ejecutarla.

## Funcionalidades

- **Seguir/dejar de seguir**: fila "Seguidores" en el panel de campos de la tarea (`work-item-fields-panel.tsx`), con un selector multi-persona igual al de "Asignados" — cualquiera con `project.view` puede agregar o quitar a cualquier persona (a sí mismo o a otros).
- **Auto-seguir al comentar**: si alguien comenta una tarea sin ser asignado ni ya seguidor, se agrega automáticamente como seguidor (silencioso).
- **Notificaciones a seguidores**: dos disparadores nuevos —
  - Comentario nuevo en la tarea: notifica a los seguidores, excluyendo al autor del comentario y a quienes ya reciben notificación por mención (evita duplicado).
  - Cambio de estado de la tarea: notifica a los seguidores, excluyendo a quien hizo el cambio.
- Solo aplica a `task`/`subtask` (no a proyectos), igual que `work_item_assignees`.
- No cambia el comportamiento de notificación de los asignados (hoy solo notifica al asignarlos; eso sigue igual).
- Sin cambios en Tablero/Lista/Gantt — solo el detalle de tarea.

## Reglas

- Seguir/dejar de seguir requiere `project.view` (no un permiso nuevo).
- La tabla es simétrica a `work_item_assignees`: sin columnas extra, reemplaza-todo al editar desde el selector (mismo patrón que `setAssignees`).

## Modelo de datos

```sql
create table public.work_item_watchers (
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  created_at timestamptz not null default now(),
  primary key (work_item_id, user_id)
);
```

RLS: `select` para miembros de la organización; `insert`/`delete` requiere `project.view` (mismo criterio laxo ya decidido, distinto del `project.assign` que rige a los asignados).

## Fuera de alcance

- Watchers en Tablero/Lista/Gantt (solo detalle de tarea).
- Auto-dejar de seguir automático.
- Permiso nuevo — reusa `project.view`.
