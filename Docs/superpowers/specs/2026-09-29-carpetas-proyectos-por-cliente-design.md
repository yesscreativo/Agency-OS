# Carpetas para agrupar proyectos por cliente — Diseño

**Fecha:** 2026-09-29
**Estado:** nuevo spec
**Objetivo:** que dentro del espacio de un cliente se puedan agrupar sus proyectos en carpetas con nombre y color (ej. "Área Contenidos", "Área Estrategia", "Cuentas"), igual que Yesid identificó que ya usan en ClickUp para organizar el trabajo de un cliente grande.

## Contexto

Yesid mostró cómo un cliente en ClickUp usa **Folders** (a los que llama "Área") que agrupan varias **Lists** (Creatividad, Diseño, Producción...), cada una con su contador de tareas. Hoy, en `/proyectos/[cliente]`, Agency OS muestra los proyectos del cliente en una lista plana sin agrupar.

Comparando estructuras: la "Lista" de ClickUp (con su contador de tareas) es exactamente lo que Agency OS ya llama **Proyecto** (`work_items` tipo `project`, con `tasks_count`/`tasks_done_count` ya calculados en `listProjects`). Lo único que falta es el nivel de arriba: una carpeta que agrupe varios proyectos de un mismo cliente.

**Aviso de nombres, ya validado con Yesid:** ya existe una tabla `public.areas` en el proyecto — es de RRHH/organización interna (departamentos con gerente, para medir carga de trabajo — ver `Docs/40-Technical/Security.md` y memoria de sesión "Áreas, Cargos y Mi área"). No tiene relación con esto. Para no chocar, el nombre interno (tabla, tipos, funciones) es **`project_folders`** / "carpeta"; la UI puede seguir diciendo "Área" si Yesid lo prefiere en el texto visible, pero el código y la base de datos usan "carpeta" siempre.

## Objetivo

1. Dentro de `/proyectos/[cliente]`, los proyectos se ven agrupados en carpetas con nombre y color, más una sección "Sin carpeta" para los que no tienen una asignada.
2. Un Administrador/gestor de proyectos (`project.manage`) puede crear, renombrar, cambiar el color y eliminar carpetas.
3. Mover un proyecto de una carpeta a otra (o a "Sin carpeta") se hace arrastrando su tarjeta, con el mismo mecanismo de drag&drop nativo que ya existe en el tablero Kanban de tareas.
4. Nada de esto rompe el resto de vistas que ya muestran proyectos (`/proyectos` global, el dashboard) — el agrupado por carpeta es exclusivo del espacio de un cliente.

## Funcionalidades

### 1. Carpetas por cliente

- Una carpeta pertenece a UN cliente (`client_id` obligatorio) — no son compartidas entre clientes, igual que en ClickUp cada Space tiene sus propios Folders.
- Nombre libre + color elegible de una paleta fija (mismo patrón visual que ya usan los estados de proyecto en `project-status-manager.tsx`).
- Un proyecto pertenece a **como mucho una** carpeta (`work_items.folder_id`, nullable). Puede no tener ninguna ("Sin carpeta") — no es obligatorio asignar una al crear un proyecto.
- Borrar una carpeta **no borra ni bloquea** sus proyectos — vuelven a "Sin carpeta" (`folder_id` se limpia solo, vía `on delete set null`). No aplica aquí el mismo criterio de "bloquear borrado en uso" del editor de roles: esto es puramente organizativo, no de permisos.
- Sin límite de profundidad adicional — confirmado con Yesid que un solo nivel de carpeta (sin sub-carpetas) alcanza.

### 2. Vista agrupada en el espacio del cliente

- `/proyectos/[cliente]` reemplaza la tabla plana de `ProjectsList` por una vista de secciones colapsables por carpeta (nombre + swatch de color + cantidad de proyectos en el header de la sección), en el orden de `sort_order`, terminando con "Sin carpeta".
- **Solo quita `ProjectsList` cuando NO hay búsqueda activa** (`searchParams.q` vacío). Si el usuario está buscando, se seguirá mostrando el resultado plano de `ProjectsList` tal cual existe hoy — agrupar por carpeta un resultado de búsqueda no aporta y complica innecesariamente. `ProjectsList` NO se modifica; sigue usándose igual en `/proyectos` (global) y en el dashboard.
- Dentro de cada sección, cada proyecto es una tarjeta arrastrable con su nombre, badge de estado y `tasksCount`/progreso — mismo contenido que ya muestra la fila de `ProjectsList` hoy, en formato tarjeta en vez de fila de tabla.
- "+ Nueva carpeta" arriba de las secciones (visible solo con `project.manage`). El botón existente "+ Nuevo proyecto" (modal `NewProjectModal`, sin cambios) se mantiene aparte — los proyectos nuevos se crean "sin carpeta" y se arrastran a la carpeta deseada después. **Fuera de alcance de este spec** preseleccionar una carpeta al crear (ver más abajo).
- Cada carpeta tiene un menú "..." (renombrar, cambiar color, eliminar) — mismo patrón de modal que ya usa `project-status-manager.tsx` para editar estados.

### 3. Arrastrar y soltar

- Reutiliza el mecanismo YA EXISTENTE en `project-board.tsx` (drag&drop nativo de HTML, sin librería): `draggable` + `onDragStart` en la tarjeta del proyecto, `onDragOver`/`onDragLeave`/`onDrop` en cada sección de carpeta (incluida "Sin carpeta" como zona de destino válida).
- Al soltar, llama a una acción que actualiza `work_items.folder_id` del proyecto arrastrado. Solo disponible con `project.manage` (igual que el drag&drop de tareas ya solo funciona con `canManage`).

## Permisos

- **Lectura:** cualquiera con `project.view` (igual que el resto del espacio del cliente) ve las carpetas y en qué carpeta está cada proyecto.
- **Escritura** (crear/renombrar/cambiar color/eliminar carpeta, mover un proyecto de carpeta): `project.manage` — mismo permiso que ya gatea crear/editar proyectos y estados. No se introduce ningún permiso nuevo.
- RLS de `project_folders` sigue el patrón exacto ya usado en `work_items`/`work_item_statuses`: `select` por organización, `write` (all) por organización + `current_user_has_permission('project.manage')`.

## Modelo de datos

Migración nueva (numerar contra la última migración real al momento de implementar; hoy sería `055_project_folders.sql`).

```sql
create table public.project_folders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  client_id uuid not null references public.clients(id) on delete cascade,
  name text not null,
  color text not null default '#7eb8ff',
  sort_order integer not null default 0,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_project_folders_client_id on public.project_folders(client_id);

alter table public.work_items
  add column folder_id uuid references public.project_folders(id) on delete set null;

alter table public.project_folders enable row level security;

create policy project_folders_select on public.project_folders
  for select using (organization_id in (select public.current_user_organization_ids()));

create policy project_folders_write on public.project_folders
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('project.manage')
  );
```

`PROJECT_LIST_SELECT` (`packages/db/src/repositories/work-items.ts`) ya usa `"*, client:clients(...)"` — `folder_id` viaja automáticamente en `ProjectRow` sin tocar la query, solo hay que regenerar `packages/db/src/types/database.ts` (`mcp__supabase__generate_typescript_types`) después de aplicar la migración.

## Repos (`packages/db/src/repositories/project-folders.ts`, nuevo)

- `listProjectFolders(db, clientId)` — ordenado por `sort_order`, excluye `deleted_at`.
- `createProjectFolder(db, { organizationId, clientId, name, color, createdBy })`.
- `updateProjectFolder(db, id, { name, color })`.
- `deleteProjectFolder(db, id)` — hard delete real (a diferencia de `work_items`/comentarios, aquí no hace falta soft-delete: no se bloquea el borrado en uso y no hay ningún valor en retener carpetas eliminadas; `on delete set null` en `work_items.folder_id` deja los proyectos en "Sin carpeta" limpio).
- `reorderProjectFolders(db, orderedIds: string[])` — mismo patrón que `reorderProjectStatuses`.

En `packages/db/src/repositories/work-items.ts`:
- `setProjectFolder(db, projectId, folderId: string | null)` — un `update` de una sola columna sobre `work_items`.

## Server actions (`apps/web/lib/project-folder-actions.ts`, nuevo)

- `createProjectFolderAction(clientId, name, color)`
- `updateProjectFolderAction(folderId, name, color)`
- `deleteProjectFolderAction(folderId)`
- `reorderProjectFoldersAction(clientId, orderedIds)`
- `setProjectFolderAction(projectId, folderId: string | null)` — la que dispara el `onDrop`.

Todas gatean `hasPermission(user, "project.manage")` (mismo patrón que las acciones existentes en `project-actions.ts`), validan que el `clientId`/`folderId` pertenezca a la organización del usuario, y hacen `revalidatePath` de la ruta del cliente (`/proyectos/[cliente-short-id]` — resolver el slug igual que ya hace la página).

## UI

- `apps/web/components/proyectos/projects-by-folder.tsx` (nuevo, client component): recibe `folders`, `rows` (con `folderId` agregado a `ProjectListRow`), `clientId`, `canManage`. Renderiza las secciones colapsables + drag&drop, siguiendo el mismo mecanismo de estado (`dragId`, `overFolderId`) que `project-board.tsx` usa para tareas.
- `apps/web/app/(app)/proyectos/[cliente]/page.tsx`: agrega `listProjectFolders(db, client.id)` al `Promise.all` existente, agrega `folderId: p.folder_id` al map de `rows`, y renderiza `{searchParams.q ? <ProjectsList ... /> : <ProjectsByFolder ... />}`.
- Modal de crear/editar carpeta: mismo patrón visual que el modal de crear/editar estado en `project-status-manager.tsx` (nombre + input de color con paleta de swatches + `readableTextOn` de `@agency-os/ui` para el contraste del texto sobre el swatch).

## Fuera de alcance

- Sub-carpetas (un segundo nivel de agrupación) — confirmado con Yesid que no hace falta.
- Preseleccionar una carpeta al crear un proyecto nuevo desde "+ Nuevo proyecto" — el flujo es crear sin carpeta y arrastrar después. Se puede agregar más adelante como un select opcional en `NewProjectModal` si el arrastre resulta tedioso en la práctica.
- Carpetas compartidas entre varios clientes, o carpetas a nivel de organización — cada carpeta es de un solo cliente.
- Mover un proyecto de carpeta por un selector/dropdown (alternativa más simple que se descartó a favor de drag&drop, decisión explícita de Yesid).
- Reordenar carpetas por drag&drop (se deja con `reorderProjectFoldersAction` disponible desde el repo, pero la primera versión de la UI no necesita exponer el control si no se pide — evaluar si hace falta al implementar).

## Dependencias

- `apps/web/components/proyectos/project-board.tsx` — referencia exacta del mecanismo de drag&drop nativo a replicar.
- `apps/web/components/proyectos/project-status-manager.tsx` — referencia del selector de color con paleta + modal de crear/editar.
- `packages/db/src/repositories/work-items.ts` (`listProjects`, `PROJECT_LIST_SELECT`, `ProjectRow`) — se extiende, no se reescribe.
- `apps/web/components/proyectos/projects-list.tsx` — NO se modifica; se deja intacta para `/proyectos` global y el dashboard.
- `Docs/40-Technical/Security.md` — para no confundir `project_folders` con la tabla `areas` de RRHH ya documentada ahí.

## Resultado esperado

Un cliente con muchos proyectos (como el ejemplo de ClickUp que trajo Yesid) se puede organizar en carpetas con nombre y color dentro de Agency OS, arrastrando proyectos entre ellas — misma experiencia de navegación que ya usan en ClickUp, sin tocar cómo funcionan las tareas ni las demás vistas de proyectos.
