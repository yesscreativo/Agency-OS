# Proyectos / Work Items — Fase A — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir el core del módulo de Proyectos/Work Items (reemplazo de ClickUp, Fase A): proyectos atados a cliente con tareas/subtareas, estados por proyecto, múltiples asignados, tablero Kanban + lista, y puente desde el CRM.

**Architecture:** Mismo stack y patrones que el CRM ya en `main`. Esquema nuevo en Supabase `agency-os` con RLS por `organization_id`; lógica pura en `packages/domain` (Vitest); acceso a datos en `packages/db` (repos con `Db` inyectable); UI en `apps/web` (App Router, Server Actions, componentes del design system y el patrón de Kanban del CRM). Todo cuelga de un proyecto; los estados son por proyecto.

**Tech Stack:** Next.js 14 App Router + TS + Tailwind · Supabase (Postgres/RLS/service-role) · Vitest · Playwright · pnpm/Turborepo.

## Global Constraints

- Proyecto Supabase destino: `agency-os` = `hicbkpwywwhnhiawulmu`. Org tenant `Laburu` = `a1ae8645-a2fa-4660-9376-27af61d25f17`.
- BD en `snake_case`; features etiquetadas por fase; cuerpo de docs en español.
- Migraciones versionadas en `supabase/migrations/` (siguiente número: revisar el último, hoy `017_*`; usar `018_*`+). Aplicar con `mcp__supabase__apply_migration` y regenerar tipos en `packages/db/src/types/database.ts`.
- RLS obligatorio en toda tabla nueva, alcance por `organization_id` con helpers existentes `current_user_organization_ids()` y `current_user_has_permission(code)`.
- Soft-delete con `deleted_at` (patrón CRM). Escrituras públicas/servidor de confianza con service-role; el resto con el server client del usuario (RLS activo).
- Commits en español, terminando con `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. NO pushear salvo pedido explícito.
- Convención de reutilización: mirar y calcar `quotes.ts`/`quote-statuses.ts` (repos), `quote-stats.ts`/`quote-status.ts` (dominio), `kanban-board.tsx`, `quote-status-manager.tsx`, `access-manager.tsx`, `crm/layout.tsx`, `(app)/(hub)/inicio` (UI/RBAC).

---

### Task 1: Migración del esquema work_items + activación del módulo + RBAC

**Files:**
- Create: `supabase/migrations/018_work_items.sql`
- Modify (regenerar): `packages/db/src/types/database.ts`
- Aplicar a `hicbkpwywwhnhiawulmu` vía `mcp__supabase__apply_migration`.

**Interfaces:**
- Produces (tablas/enums que las tareas siguientes consumen):
  - enums `work_item_type` (`project|task|subtask`), `work_item_priority` (`low|normal|high|urgent`), `project_state` (`active|completed|archived`).
  - `work_items(id, organization_id, type, project_id, parent_id, title, description, status_id, project_state, priority, client_id, quote_id, start_date, due_date, sort_order, created_by, created_at, updated_at, deleted_at)`.
  - `work_item_statuses(id, organization_id, project_id, label, color, sort_order, is_done, created_at)`.
  - `work_item_assignees(work_item_id, user_id, organization_id)` PK `(work_item_id, user_id)`.
  - permisos `project.view`/`project.manage`/`project.assign`; módulo `proyectos` activo.
  - función `seed_default_work_item_statuses(p_project_id uuid, p_org uuid)`.

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/018_work_items.sql` con (convención del proyecto):

```sql
-- Enums
create type work_item_type as enum ('project','task','subtask');
create type work_item_priority as enum ('low','normal','high','urgent');
create type project_state as enum ('active','completed','archived');

-- work_items
create table work_items (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  type work_item_type not null,
  project_id uuid not null,               -- proyecto dueño (para un row project = su propio id)
  parent_id uuid references work_items(id) on delete cascade,
  title text not null,
  description text,
  status_id uuid,                          -- FK a work_item_statuses (task/subtask); null en project
  project_state project_state,             -- solo en project (default active)
  priority work_item_priority not null default 'normal',
  client_id uuid references clients(id),
  quote_id uuid references quotes(id),
  start_date date,
  due_date date,
  sort_order int not null default 0,
  created_by uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint work_items_project_needs_client check (type <> 'project' or client_id is not null),
  constraint work_items_project_has_state   check (type <> 'project' or project_state is not null)
);
create index work_items_project_idx on work_items(project_id) where deleted_at is null;
create index work_items_org_idx on work_items(organization_id) where deleted_at is null;

-- work_item_statuses (columnas del tablero, por proyecto)
create table work_item_statuses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  project_id uuid not null references work_items(id) on delete cascade,
  label text not null,
  color text not null default '#9aa1ab',
  sort_order int not null default 0,
  is_done boolean not null default false,
  created_at timestamptz not null default now()
);
create index work_item_statuses_project_idx on work_item_statuses(project_id);
alter table work_items
  add constraint work_items_status_fk foreign key (status_id) references work_item_statuses(id) on delete set null;

-- work_item_assignees
create table work_item_assignees (
  work_item_id uuid not null references work_items(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  primary key (work_item_id, user_id)
);

-- Seed de estados por defecto al crear un proyecto
create or replace function seed_default_work_item_statuses(p_project_id uuid, p_org uuid)
returns void language sql security definer set search_path = public as $$
  insert into work_item_statuses (organization_id, project_id, label, color, sort_order, is_done) values
    (p_org, p_project_id, 'Por hacer',   '#9aa1ab', 0, false),
    (p_org, p_project_id, 'En progreso', '#7eb8ff', 1, false),
    (p_org, p_project_id, 'En revisión', '#f5c95a', 2, false),
    (p_org, p_project_id, 'Hecho',       '#1f8f4d', 3, true);
$$;

-- RLS (patrón CRM)
alter table work_items enable row level security;
alter table work_item_statuses enable row level security;
alter table work_item_assignees enable row level security;

create policy work_items_select on work_items for select to authenticated
  using (organization_id in (select current_user_organization_ids()));
create policy work_items_write on work_items for all to authenticated
  using (organization_id in (select current_user_organization_ids()) and current_user_has_permission('project.manage'))
  with check (organization_id in (select current_user_organization_ids()) and current_user_has_permission('project.manage'));

create policy wis_select on work_item_statuses for select to authenticated
  using (organization_id in (select current_user_organization_ids()));
create policy wis_write on work_item_statuses for all to authenticated
  using (organization_id in (select current_user_organization_ids()) and current_user_has_permission('project.manage'))
  with check (organization_id in (select current_user_organization_ids()) and current_user_has_permission('project.manage'));

create policy wia_select on work_item_assignees for select to authenticated
  using (organization_id in (select current_user_organization_ids()));
create policy wia_write on work_item_assignees for all to authenticated
  using (organization_id in (select current_user_organization_ids()) and current_user_has_permission('project.assign'))
  with check (organization_id in (select current_user_organization_ids()) and current_user_has_permission('project.assign'));

-- Permisos + módulo
insert into permissions (code, description) values
  ('project.view','Ver proyectos'),
  ('project.manage','Crear/editar proyectos, tareas y estados'),
  ('project.assign','Asignar usuarios a work items')
on conflict (code) do nothing;

update modules set is_active = true where code = 'proyectos';

-- Otorgar a super (administrador) y a los roles del CRM con gestión
insert into role_permissions (role_id, permission_id)
select r.id, p.id from roles r cross join permissions p
where p.code in ('project.view','project.manage','project.assign')
  and r.code in ('administrador','crm_admin','director')
on conflict do nothing;
```

> Verificar antes de escribir: nombres reales de columnas de `permissions`/`roles`/`role_permissions`/`modules` con `mcp__supabase__list_tables` (el CRM usó `code`/`is_active`; confirmar). Ajustar el número de migración al siguiente disponible.

- [ ] **Step 2: Aplicar la migración**

Usar `mcp__supabase__apply_migration` (project_id `hicbkpwywwhnhiawulmu`, name `018_work_items`, query = el SQL de arriba). Si falla por nombres de columnas, corregir y reaplicar.

- [ ] **Step 3: Verificar con SQL**

Run (`mcp__supabase__execute_sql`):
```sql
select count(*) from information_schema.tables where table_name in ('work_items','work_item_statuses','work_item_assignees');
select is_active from modules where code='proyectos';
select code from permissions where code like 'project.%' order by 1;
```
Expected: 3 tablas · `is_active=true` · 3 permisos.

- [ ] **Step 4: Regenerar tipos**

Usar `mcp__supabase__generate_typescript_types` y volcar a `packages/db/src/types/database.ts`. Verificar que aparezcan `work_items`/`work_item_statuses`/`work_item_assignees` y los enums.

- [ ] **Step 5: Typecheck + commit**

Run: `cd "Agency OS" && pnpm --filter @agency-os/db exec tsc --noEmit`
Expected: EXIT 0.
```bash
git add supabase/migrations/018_work_items.sql packages/db/src/types/database.ts
git commit -m "Proyectos Fase A: esquema work_items + módulo activo + RBAC

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Dominio — progreso y validación (Vitest, TDD)

**Files:**
- Create: `packages/domain/src/work-item.ts`
- Test: `packages/domain/src/work-item.test.ts`
- Modify: `packages/domain/src/index.ts` (agregar `export * from "./work-item";`)

**Interfaces:**
- Produces:
  - `interface WorkItemProgressRow { statusIsDone: boolean }`
  - `projectProgress(tasks: WorkItemProgressRow[]): number` — % (0–100) de tareas en estado `is_done`; 0 si no hay tareas.
  - `validateWorkItemTitle(title: string): { valid: boolean; error?: string }`
  - `WORK_ITEM_PRIORITIES: readonly ["low","normal","high","urgent"]`

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/domain/src/work-item.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { projectProgress, validateWorkItemTitle, WORK_ITEM_PRIORITIES } from "./work-item";

describe("projectProgress", () => {
  it("0% sin tareas", () => expect(projectProgress([])).toBe(0));
  it("50% con la mitad hechas", () =>
    expect(projectProgress([{ statusIsDone: true }, { statusIsDone: false }])).toBe(50));
  it("100% todas hechas", () =>
    expect(projectProgress([{ statusIsDone: true }, { statusIsDone: true }])).toBe(100));
  it("redondea", () =>
    expect(projectProgress([{ statusIsDone: true }, { statusIsDone: false }, { statusIsDone: false }])).toBe(33));
});

describe("validateWorkItemTitle", () => {
  it("rechaza vacío", () => expect(validateWorkItemTitle("  ").valid).toBe(false));
  it("acepta con texto", () => expect(validateWorkItemTitle("Diseño de landing").valid).toBe(true));
});

describe("prioridades", () => {
  it("son 4", () => expect(WORK_ITEM_PRIORITIES).toHaveLength(4));
});
```

- [ ] **Step 2: Correr y verlo fallar**

Run: `pnpm --filter @agency-os/domain exec vitest run src/work-item.test.ts`
Expected: FAIL ("Cannot find module ./work-item").

- [ ] **Step 3: Implementar**

Crear `packages/domain/src/work-item.ts`:
```ts
export const WORK_ITEM_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type WorkItemPriority = (typeof WORK_ITEM_PRIORITIES)[number];

export interface WorkItemProgressRow {
  statusIsDone: boolean;
}

/** % (0–100) de tareas cuyo estado es "done". 0 si no hay tareas. */
export function projectProgress(tasks: WorkItemProgressRow[]): number {
  if (tasks.length === 0) return 0;
  const done = tasks.filter((t) => t.statusIsDone).length;
  return Math.round((done / tasks.length) * 100);
}

export function validateWorkItemTitle(title: string): { valid: boolean; error?: string } {
  if (!title.trim()) return { valid: false, error: "El título es obligatorio." };
  return { valid: true };
}
```
Agregar a `packages/domain/src/index.ts`: `export * from "./work-item";`

- [ ] **Step 4: Correr y verlo pasar**

Run: `pnpm --filter @agency-os/domain exec vitest run src/work-item.test.ts`
Expected: PASS (todos). Correr `pnpm --filter @agency-os/domain test` para el suite completo.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/work-item.ts packages/domain/src/work-item.test.ts packages/domain/src/index.ts
git commit -m "Proyectos Fase A: dominio (progreso + validación de work items)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Repos en packages/db (work-items + work-item-statuses)

**Files:**
- Create: `packages/db/src/repositories/work-items.ts`
- Create: `packages/db/src/repositories/work-item-statuses.ts`
- Modify: `packages/db/src/index.ts` (exportar ambos)

**Interfaces:**
- Consumes: type `Database` y el tipo `Db` del patrón existente (ver `repositories/shared.ts` y `quotes.ts`).
- Produces (firmas que consume la UI):
  - `listProjects(db, orgId, opts?: { search?: string }): Promise<ProjectRow[]>` — proyectos (`type='project'`, no borrados) con `client`, conteo de tareas y tareas-hechas embebidos.
  - `getProject(db, id): Promise<ProjectDetail | null>` — proyecto + sus `work_item_statuses` + tareas/subtareas (con `assignees`).
  - `createProject(db, input: { orgId, clientId, quoteId?, title, createdBy }): Promise<string>` — inserta el proyecto (`project_id`=su propio id vía update tras insert; `project_state='active'`) y llama a seedear estados; devuelve el id.
  - `createWorkItem(db, input: { orgId, projectId, parentId, type: 'task'|'subtask', title, statusId, priority?, dueDate? }): Promise<string>`
  - `updateWorkItem(db, id, patch): Promise<void>` (title/description/priority/status_id/dates/sort_order/project_state)
  - `softDeleteWorkItem(db, id): Promise<void>`
  - `setAssignees(db, workItemId, orgId, userIds: string[]): Promise<void>` (reemplaza el set)
  - `listStatuses(db, projectId): Promise<StatusRow[]>` · `createStatus`/`updateStatus`/`deleteStatus`/`reorderStatuses` (patrón `quote-statuses.ts`).

- [ ] **Step 1: Implementar `work-item-statuses.ts`**

Calcar `packages/db/src/repositories/quote-statuses.ts` (leerlo primero). CRUD + `reorderStatuses(db, ids: string[])` que setea `sort_order` por índice. Tipos desde `Database["public"]["Tables"]["work_item_statuses"]`.

- [ ] **Step 2: Implementar `work-items.ts`**

Calcar el patrón de `quotes.ts` (embeds de PostgREST, filtros, paginación interna por 1000 si aplica). `createProject` inserta con `project_id` temporal = `id` generado en cliente (usar `crypto.randomUUID()` para el id, así `project_id = id` en un solo insert, evitando el update posterior). Tras insertar, llamar `db.rpc("seed_default_work_item_statuses", { p_project_id: id, p_org: orgId })`. `getProject` trae statuses ordenados por `sort_order` y las tareas con `work_item_assignees(user_id, users(...))`.

- [ ] **Step 3: Exportar**

En `packages/db/src/index.ts` agregar:
```ts
export * from "./repositories/work-items";
export * from "./repositories/work-item-statuses";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @agency-os/db exec tsc --noEmit`
Expected: EXIT 0.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repositories/work-items.ts packages/db/src/repositories/work-item-statuses.ts packages/db/src/index.ts
git commit -m "Proyectos Fase A: repos work-items y work-item-statuses

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Server actions + gating del módulo

**Files:**
- Create: `apps/web/lib/project-actions.ts`
- Modify: `apps/web/lib/auth.ts` (helper `canAccessModule` ya existe; verificar `hasPermission` cubre los nuevos codes — no requiere cambio si lee de la BD).

**Interfaces:**
- Consumes: repos de Task 3, `getCurrentUser()`, `hasPermission(user, code)`, `getSupabaseServerClient()`.
- Produces (Server Actions, patrón de `lib/quote-actions.ts`/`client-actions.ts`):
  - `createProjectAction(input: { clientId: string; quoteId?: string; title: string }): Promise<{ id?: string; error?: string }>` — gate `project.manage`; valida título; crea y devuelve id.
  - `saveWorkItem(input)`, `deleteWorkItem(id)`, `moveWorkItem(id, statusId)` (gate `project.manage`), `setWorkItemAssignees(id, userIds)` (gate `project.assign`).
  - `saveProjectStatus`/`deleteProjectStatus`/`reorderProjectStatuses` (gate `project.manage`).

- [ ] **Step 1: Implementar** siguiendo `lib/client-actions.ts` (gate + `revalidatePath` + manejo de error), usando `getCurrentUser`, `hasPermission`, el server client y los repos. Cada acción valida permiso y `organization_id` (defense-in-depth como en `updateClient`).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @agency-os/web exec tsc --noEmit` → EXIT 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/project-actions.ts
git commit -m "Proyectos Fase A: server actions (proyecto/tarea/estado/asignados)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: UI — lista de proyectos + layout del módulo + landing

**Files:**
- Create: `apps/web/app/(app)/proyectos/layout.tsx` (sub-nav propia; calcar `crm/layout.tsx`)
- Create: `apps/web/app/(app)/proyectos/page.tsx` (server; gate `project.view` + módulo)
- Create: `apps/web/components/proyectos/projects-list.tsx` (client; tabla + modal "Nuevo proyecto")
- Modify: `apps/web/app/(app)/(hub)/inicio/page.tsx` (la tarjeta `proyectos` ya se activa por `is_active`; verificar "Abrir →").

**Interfaces:**
- Consumes: `listProjects`, `createProjectAction`, lista de clientes (`listClients` de `repositories/clients.ts`), `getCurrentUser`.
- Produces: ruta `/proyectos` navegable; el modal exige **cliente** (obligatorio) + título → `createProjectAction` → navega a `/proyectos/[id]`.

- [ ] **Step 1: Layout + página lista** calcando `crm/layout.tsx` y `crm/page.tsx`: server component que valida sesión + `canAccessModule(user,'proyectos')` (redirige a `/inicio` si no) + `hasPermission(user,'project.view')`; llama `listProjects`; pasa a `projects-list.tsx`. Columnas: Nombre · Cliente · Nº tareas · Progreso (`projectProgress` del dominio) · Estado.
- [ ] **Step 2: Modal "Nuevo proyecto"** en `projects-list.tsx` (client): select de cliente (de `listClients`, **required**, bloquea submit sin cliente) + título → `createProjectAction`; on success `router.push('/proyectos/'+id)`. Reusar `Modal`/`Input`/`Select`/`Button` del UI kit.
- [ ] **Step 3: Verificar build** `pnpm --filter @agency-os/web exec tsc --noEmit` → EXIT 0; `pnpm --filter @agency-os/web lint`.
- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(app\)/proyectos apps/web/components/proyectos/projects-list.tsx
git commit -m "Proyectos Fase A: lista de proyectos + alta con cliente obligatorio

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: UI — detalle de proyecto (Kanban + lista + tareas/subtareas + asignados)

**Files:**
- Create: `apps/web/app/(app)/proyectos/[id]/page.tsx` (server; `getProject`; gate)
- Create: `apps/web/components/proyectos/project-board.tsx` (client; Kanban por estados del proyecto — calcar `components/crm/kanban-board.tsx`)
- Create: `apps/web/components/proyectos/work-item-editor.tsx` (client; crear/editar tarea/subtarea: título, descripción, prioridad, estado, fechas, **asignados múltiples**)

**Interfaces:**
- Consumes: `getProject`, `saveWorkItem`, `moveWorkItem`, `deleteWorkItem`, `setWorkItemAssignees`, y la lista de usuarios de la org (`listOrgUsers` de `repositories/users.ts`) para el selector de asignados.
- Produces: `/proyectos/[id]` con tablero funcional; drag&drop → `moveWorkItem` con update optimista + rollback (patrón `kanban-board.tsx`).

- [ ] **Step 1: Página detalle** (server): `getProject(id)`; si null → `notFound()`; valida módulo/permiso; pasa proyecto + statuses + tareas + usuarios de la org al board. Toggle Lista/Tablero.
- [ ] **Step 2: `project-board.tsx`** calcando `kanban-board.tsx`: columnas = `work_item_statuses` del proyecto; tarjetas = tareas (título, `Avatar`/`AvatarGroup` de asignados, `Badge` de prioridad, due_date, contador de subtareas); drag entre columnas → `moveWorkItem(id, statusId)` optimista. Click en tarjeta abre `work-item-editor`.
- [ ] **Step 3: `work-item-editor.tsx`**: form de tarea/subtarea con `saveWorkItem`; selector de **asignados múltiples** (multi-select de usuarios) → `setWorkItemAssignees`; crear subtarea (parent = la tarea). Reusar `Modal`/`Input`/`Textarea`/`Select`/`Badge`/`Avatar`.
- [ ] **Step 4: Verificar** typecheck + lint → EXIT 0.
- [ ] **Step 5: Commit**

```bash
git add apps/web/app/\(app\)/proyectos/\[id\] apps/web/components/proyectos/project-board.tsx apps/web/components/proyectos/work-item-editor.tsx
git commit -m "Proyectos Fase A: detalle con Kanban, tareas/subtareas y asignados

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: UI — gestor de estados por proyecto

**Files:**
- Create: `apps/web/components/proyectos/project-status-manager.tsx` (client; calcar `components/crm/quote-status-manager.tsx`)
- Modify: `apps/web/app/(app)/proyectos/[id]/page.tsx` (montar el gestor, p. ej. en un panel/tab "Estados")

**Interfaces:**
- Consumes: `saveProjectStatus`, `deleteProjectStatus`, `reorderProjectStatuses` (Task 4), `listStatuses` (via `getProject`).
- Produces: CRUD + drag&drop de reordenar + color picker + toggle `is_done`, todo scopeado al `project_id`.

- [ ] **Step 1: Implementar** calcando `quote-status-manager.tsx` (color picker con swatches, preview, drag&drop nativo), pero por proyecto y con checkbox `is_done` (define qué columna cuenta como "hecha" para el progreso). Gate `project.manage`.
- [ ] **Step 2: Verificar** typecheck + lint → EXIT 0.
- [ ] **Step 3: Commit**

```bash
git add apps/web/components/proyectos/project-status-manager.tsx apps/web/app/\(app\)/proyectos/\[id\]/page.tsx
git commit -m "Proyectos Fase A: gestor de estados por proyecto

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: Puente CRM — "Crear proyecto" desde cotización aceptada

**Files:**
- Modify: `apps/web/app/(app)/crm/[id]/page.tsx` (pasar flag de si ya existe proyecto para la quote)
- Modify: `apps/web/components/crm/quote-form.tsx` (botón "Crear proyecto" cuando `status='accepted'`)
- Modify: `apps/web/lib/project-actions.ts` (reusar `createProjectAction` con `quoteId` + `clientId` de la cotización)

**Interfaces:**
- Consumes: `createProjectAction({ clientId, quoteId, title })`.
- Produces: en `/crm/[id]` aceptada, botón que crea el proyecto (nombre = `quote_name`/código, `client_id` y `quote_id` de la cotización) y redirige a `/proyectos/[id]`. Si ya existe un proyecto con ese `quote_id`, el botón enlaza a él en vez de duplicar.

- [ ] **Step 1: Query "proyecto existente por quote"** en el page (o repo `getProjectByQuote(db, quoteId)`), para no duplicar.
- [ ] **Step 2: Botón** en `quote-form.tsx` (solo `status='accepted'` y con permiso `project.manage`): "Crear proyecto" → `createProjectAction`; o "Ver proyecto →" si ya existe.
- [ ] **Step 3: Verificar** typecheck + lint → EXIT 0.
- [ ] **Step 4: Commit**

```bash
git add apps/web/app/\(app\)/crm/\[id\]/page.tsx apps/web/components/crm/quote-form.tsx apps/web/lib/project-actions.ts
git commit -m "Proyectos Fase A: puente CRM (crear proyecto desde cotización aceptada)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: Verificación end-to-end (Playwright) + checklist para Yesid

**Files:**
- Create (temporal): `apps/web/tests/e2e/proyectos.spec.ts` (borrar al final si se prefiere, como se hizo con los e2e del CRM)

- [ ] **Step 1: Levantar UN solo `pnpm dev`** (matar cualquiera previo + `rm -rf apps/web/.next` si hay chunks corruptos — incidente recurrente del CRM).
- [ ] **Step 2: e2e** (login `yesid.parra@`, credenciales en `.env.local`): crear proyecto directo (verifica cliente obligatorio: submit sin cliente bloquea) → crear tarea → crear subtarea → asignar 2 usuarios → mover tarea de columna (persiste tras reload) → editar estados del proyecto (persiste) → progreso refleja las hechas → gating: un usuario sin `project.view` no ve `/proyectos`. Screenshots en tema claro y oscuro.
- [ ] **Step 3: Puente CRM**: desde una cotización aceptada (p. ej. una migrada de PETUS/Sergio si está `accepted`, o cambiarle el estado), "Crear proyecto" → cae en `/proyectos/[id]` con cliente y quote enlazados; reabrir muestra "Ver proyecto".
- [ ] **Step 4: turbo full** `pnpm typecheck && pnpm lint && pnpm test` → todo verde.
- [ ] **Step 5: Entregar checklist manual a Yesid** (validación de negocio) y NO pushear. Dejar el `pnpm dev` corriendo para que Yesid pruebe.

---

## Notas de reutilización (rutas exactas a calcar)

- Kanban: `apps/web/components/crm/kanban-board.tsx` (drag&drop optimista + rollback).
- Gestor de estados: `apps/web/components/crm/quote-status-manager.tsx` (color picker, drag reorder).
- Layout de módulo + sub-nav: `apps/web/app/(app)/crm/layout.tsx`.
- Repos: `packages/db/src/repositories/quotes.ts` y `quote-statuses.ts`.
- Server actions + gate: `apps/web/lib/quote-actions.ts` y `client-actions.ts`.
- RBAC/módulos: `apps/web/lib/auth.ts` (`getCurrentUser`, `canAccessModule`, `hasPermission`), `access-manager.tsx`, landing `(app)/(hub)/inicio/page.tsx`.
- Dominio + tests: `packages/domain/src/quote-stats.ts` + `quote-stats.test.ts`.
