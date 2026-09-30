# Gantt/Timeline por proyecto — Diseño

**Fecha:** 2026-09-30
**Estado:** nuevo spec
**Objetivo:** dar a cada proyecto (opcionalmente) una vista Gantt/timeline editable para el equipo, y un link público de solo lectura para que el cliente vea el flujo del proyecto en vivo. No reemplaza Tablero/Lista/Estados — es una pestaña más sobre las mismas `work_items`.

## Contexto

Viene de la auditoría de uso real de ClickUp (`Docs/30-Functional/ClickUp-Parity.md`, sección 3, punto 3): el uso interno real del equipo **no** tiene un Gantt real (las listas "GANTT GENERAL PROYECTOS" en ClickUp resultaron ser checklists de proceso sin fechas ni dependencias). La razón de construirlo en Agency OS es otra, decidida por Yesid: mostrarle al **cliente** el flujo completo del proyecto (visibilidad externa/comercial), no replicar un hábito interno.

Portal Cliente (`Docs/30-Functional/PortalCliente.md`) es un doc esqueleto sin nada construido, y está en el roadmap como **V2** — no existe login de cliente ni magic link. Por eso la visibilidad de cliente para este spec se resuelve con un link público con token (mismo patrón ya usado en `(public)/proveedor/[token]`), no con Portal Cliente.

Durante el brainstorm surgió además un gap real y separado de la misma auditoría (watchers/seguidores) que **no** es parte de este spec — queda pendiente aparte, ver `Docs/superpowers/specs/2026-08-05-clickup-parity-*` y memoria de sesión.

## Funcionalidades

### 1. Activación por proyecto

- El Gantt **no** es automático — la mayoría de los proyectos no lo tienen. Un botón "Activar Gantt" (visible con `project.manage`) en el proyecto agrega la pestaña "Gantt" junto a Tablero/Lista/Estados.
- Al activarlo, el Gantt **arranca vacío**. No importa retroactivamente ninguna tarea existente del proyecto, aunque ya tenga fechas — evita que activar el Gantt en un proyecto viejo genere una vista con huecos/desorden de tareas que nunca se pensaron para eso.

### 2. Qué tareas aparecen en el Gantt

- Campo nuevo `on_gantt` en `work_items` (`task`/`subtask`), default `false`.
- Se marca `true` automáticamente cuando la tarea se crea desde el botón "+ Agregar tarea" del Gantt (ese formulario exige `start_date` y `due_date`, a diferencia de Tablero/Lista donde son opcionales).
- También disponible como checkbox opcional "Mostrar en Gantt" al editar cualquier tarea desde Tablero/Lista, para sumar una tarea existente al Gantt a mano.
- Es la **misma fila** de `work_items` en todos los casos — una tarea creada desde el Gantt aparece igual en Tablero y Lista; no hay una entidad paralela.
- **Jerarquía (tarea con subtareas):** si una tarea y sus subtareas están todas marcadas `on_gantt`, la subtarea aparece anidada/indentada debajo de su padre, cada una con su propia barra. La barra del padre tiene su propia fecha fijada a mano — **no** se recalcula automáticamente como envolvente de sus subtareas (sin lógica de "barra resumen" tipo MS Project).

### 3. Vista interna (equipo)

- Panel izquierdo: nombre de tarea, responsable(s) (avatares apilados si hay más de uno, reusando `work_item_assignees`), rango de fechas.
- Panel derecho: timeline con barras posicionadas por `start_date`/`due_date`. Color de barra = color del estado actual de la tarea (`work_item_statuses.color`, ya configurable por proyecto — **no** una categoría de tarea nueva tipo "diseño/dev/testing/deploy").
- Crear tarea: modal (nombre, tipo, responsable(s), fecha inicio, fecha fin — fechas obligatorias acá).
- Editar inline: nombre, responsable(s), estado, fechas.
- Arrastrar barra: mover el centro desplaza ambas fechas manteniendo duración; arrastrar un borde estira/encoge (ajusta duración). Implementado con eventos de mouse nativos (`mousedown`/`mousemove`/`mouseup`), sin librería de drag — el proyecto no usa ninguna (el Kanban actual usa `draggable`/`onDragStart` nativo de HTML5, pero ese patrón es para drop discreto entre columnas; acá el movimiento es continuo en píxeles).
- Sin librerías de fecha nuevas (`date-fns`, etc.) — el proyecto no usa ninguna hoy; cálculos con `Date` nativo.

### 4. Dependencias básicas (bloqueos)

- Nueva tabla `work_item_dependencies`: una tarea puede bloquear a otra. Se dibuja un conector/flecha simple entre las barras relacionadas.
- Validación al crear una dependencia: rechazar solo el ciclo directo (A bloquea a B, y B ya bloqueaba a A). No se construye un motor de detección de ciclos multi-salto.
- **Cascada de fechas — solo hacia adelante:**
  - Si la fecha de fin de la tarea bloqueante se **atrasa**, la tarea bloqueada se corre hacia adelante la misma cantidad de días, conservando su propia duración. Se repite transitivamente por toda la cadena de dependientes.
  - Si la bloqueante se **adelanta**, no se acorta nada automáticamente (evita pisar una fecha que el equipo fijó a mano por otra razón).
  - Si una tarea tiene más de un bloqueante, manda el que tenga la fecha de fin más tardía.
- Esta cascada es una excepción deliberada a la sección 4 de `ClickUp-Parity.md` ("dependencias entre tareas = falso gap de uso interno") — se construye igual porque el motivo es la coherencia visual del Gantt de cara al cliente, no replicar un hábito interno.

### 5. Link público de solo lectura (cliente)

- Nueva tabla `work_item_share_links`: `project_id` (único, FK a `work_items` tipo `project`), `token`, `revoked_at` (nullable), `created_by`, `created_at`. Sin `expires_at` — un proyecto dura semanas/meses, no tiene el mismo sentido de expiración que un link de cotización (5 días). Se invalida solo con `revoked_at` (botón "Revocar" en el proyecto, `project.manage`).
- Generar el link es una acción explícita y separada de activar el Gantt (botón "Generar link" dentro de la pestaña Gantt) — activar el Gantt no comparte nada con el cliente automáticamente. Una vez generado, el botón cambia a "Copiar link" / "Revocar".
- Ruta pública `(public)/proyecto/[token]`, mismo patrón que `(public)/proveedor/[token]`: resuelve el token server-side (rechaza si no existe o `revoked_at` no es null), arma un DTO limitado, sin autenticación.
- Qué ve el cliente en esa vista:
  - Las barras del Gantt (nombre, fechas, color de estado, conectores de dependencia) — igual que la vista interna, pero sin poder editar ni arrastrar.
  - Comentarios y adjuntos del proyecto/tareas, pero **solo** los marcados como visibles para cliente (ver punto 6). Nunca ve comentarios/adjuntos internos.
  - No ve el botón de generar/revocar link, ni ninguna acción de edición.

### 6. Visibilidad de comentarios y adjuntos

- `work_item_comments.visibility` **ya existe** (`'internal' | 'client_visible'`, agregado en `023_work_item_comments_activity.sql` como forward-compat sin UI) — este spec activa el toggle "Compartir con cliente" al escribir un comentario, usando el mismo permiso que ya se necesita para comentar hoy (cualquiera que ve el proyecto).
- `work_item_attachments` no tiene ese campo — migración nueva agrega `visibility text not null default 'internal'` con los mismos dos valores, y el mismo toggle al subir un adjunto (con el mismo permiso que ya rige adjuntar hoy, `project.manage`).
- Los adjuntos siguen sirviéndose por signed URL generada server-side (patrón ya existente en `019_work_item_attachments.sql`) — la ruta pública genera la signed URL solo para adjuntos `client_visible`, nunca expone el bucket directamente.

## Reglas

- El Gantt es una vista sobre `work_items`, nunca una entidad paralela — toda tarea creada ahí es una tarea normal, visible en Tablero/Lista.
- Activar el Gantt en un proyecto no modifica ni oculta nada de lo que ya existe en Tablero/Lista/Estados — solo agrega la pestaña nueva, vacía.
- La cascada de fechas nunca se dispara al mover una tarea que no tiene dependientes — no hay recalculo global del proyecto en cada arrastre, solo de la cadena afectada.
- Ninguna acción del cliente en el link público puede mutar datos — es una vista de solo lectura sin ninguna acción expuesta.
- No se sincroniza nada con ClickUp — mencionado en un ejemplo previo de este mismo spec como posible "futuro", descartado explícitamente por ir en contra de la estrategia de reemplazar ClickUp, no depender de él.

## Modelo de datos

```sql
-- Activación por proyecto + marca de "esta tarea vive en el Gantt"
alter table public.work_items add column gantt_enabled boolean not null default false; -- solo relevante en type='project'
alter table public.work_items add column on_gantt boolean not null default false;      -- solo relevante en type in ('task','subtask')

-- Dependencias (bloqueos simples, sin motor de grafo)
create table public.work_item_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  work_item_id uuid not null references public.work_items(id) on delete cascade,           -- tarea bloqueada
  depends_on_work_item_id uuid not null references public.work_items(id) on delete cascade, -- tarea bloqueante
  created_at timestamptz not null default now(),
  unique (work_item_id, depends_on_work_item_id),
  check (work_item_id <> depends_on_work_item_id)
);
create index work_item_dependencies_item_idx on public.work_item_dependencies(work_item_id);
create index work_item_dependencies_blocker_idx on public.work_item_dependencies(depends_on_work_item_id);

-- Visibilidad de adjuntos (paridad con work_item_comments.visibility)
alter table public.work_item_attachments add column visibility text not null default 'internal';
alter table public.work_item_attachments add constraint work_item_attachments_visibility_check
  check (visibility in ('internal', 'client_visible'));

-- Link público de solo lectura, uno por proyecto
create table public.work_item_share_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null unique references public.work_items(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  revoked_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);
```

### RLS

- `work_item_dependencies`: mismo patrón que `work_item_attachments` — `select` para miembros de la organización; `insert`/`update`/`delete` requiere `project.manage`.
- `work_item_share_links`: `select`/`insert`/`update` (generar, revocar) requiere `project.manage`. La ruta pública **no** usa el cliente autenticado de Supabase para leer esto — resuelve el token con `service_role` en una server action, igual que `(public)/proveedor/[token]`, y arma un DTO explícito (nunca expone la fila cruda ni otras tablas).
- Ningún cambio a las policies existentes de `work_items`, `work_item_comments`, `work_item_attachments` más allá de la constraint de visibilidad agregada arriba.

## Permisos

No se agregan permisos nuevos — todo reusa los que ya existen:

- `project.view`: ver la pestaña Gantt y sus barras.
- `project.manage`: activar/desactivar Gantt, crear/editar/arrastrar tareas y dependencias del Gantt, generar/revocar el link público, marcar un adjunto como visible para cliente.
- Comentar y marcar "compartir con cliente": mismo requisito que ya rige comentar hoy (cualquiera que ve el proyecto).

## Vistas

- Pestaña "Gantt" en `/proyectos/[cliente]/[proyecto]`, junto a Tablero/Lista/Estados — visible solo si `gantt_enabled = true`. Incluye botón "Activar Gantt" cuando aún no lo está, y "Revocar link" / "Copiar link" cuando ya está activo.
- Ruta pública `(public)/proyecto/[token]`: Gantt de solo lectura + comentarios/adjuntos `client_visible`.

## Fuera de alcance

- Sincronización con ClickUp.
- Motor de dependencias con detección de ciclos multi-salto (solo se rechaza el ciclo directo A↔B).
- Expiración de link público (solo revocación manual).
- Importar retroactivamente tareas viejas al activar el Gantt (queda disponible el checkbox manual "Mostrar en Gantt", pero no es automático).
- Watchers/seguidores, sub-estatus de contenido/copy — gaps reales de la misma auditoría, pero de otro spec.
- Cualquier pieza de Portal Cliente más allá de esta vista puntual (login de cliente, bolsa de horas, tickets, etc. siguen en V2 sin tocar).

## Resultado esperado

Un PM activa el Gantt en el proyecto "Campaña Q1" de un cliente. Arranca vacío; va agregando ahí las tareas del cronograma que le quiere mostrar al cliente (con fechas y dependencias), mientras el resto de tareas operativas del proyecto sigue viviendo en Tablero/Lista sin aparecer en el Gantt. Cuando "Diseño de piezas" se atrasa 3 días, "Desarrollo de landing" (que depende de ella) se corre 3 días automáticamente. El PM genera un link, lo manda al cliente, y marca como "visible para cliente" el comentario donde avisa el atraso — el cliente entra al link, ve el timeline actualizado y ese comentario, sin poder tocar nada ni ver el resto de la conversación interna del equipo.
