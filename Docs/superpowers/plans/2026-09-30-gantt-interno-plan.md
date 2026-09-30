# Gantt interno (Fase 1 de 2) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dar a cada proyecto una pestaña "Gantt" opcional (activable) donde el equipo crea/edita/arrastra tareas con fechas y dependencias básicas (bloqueos con cascada hacia adelante), sin tocar Tablero/Lista/Estados existentes.

**Architecture:** Todo vive en la misma tabla `work_items` (dos columnas nuevas: `gantt_enabled` en el proyecto, `on_gantt` en tarea/subtarea) más una tabla nueva `work_item_dependencies`. La lógica de cascada de fechas y el chequeo de ciclo directo son funciones puras en `@agency-os/domain` (testeadas con vitest), consumidas por una server action que persiste los cambios en bloque. La UI reusa el patrón de pestañas ya existente en `ProjectBoard` (`view` state + `Chip`) y el estilo visual/drag nativo (sin librerías nuevas) del tablero Kanban actual.

**Tech Stack:** Next.js (App Router) + TypeScript + Tailwind, Supabase (Postgres/RLS), pnpm/turbo monorepo. Sin dependencias nuevas — el proyecto no usa `date-fns` ni ninguna librería de drag&drop; se sigue esa convención (Date nativo, eventos de mouse nativos).

## Global Constraints

- Reutilizar permisos existentes únicamente: `project.view` (ver), `project.manage` (activar Gantt, crear/editar/arrastrar, dependencias). No se crean permisos nuevos.
- Sin librerías nuevas (`date-fns`, `dnd-kit`, `react-beautiful-dnd`, etc.) — cálculos de fecha con `Date`/strings `YYYY-MM-DD`, drag con `mousedown`/`mousemove`/`mouseup` nativos.
- Cascada de fechas **solo hacia adelante** (nunca acorta automáticamente si un bloqueante se adelanta); si una tarea tiene varios bloqueantes, manda el de fecha de fin más tardía.
- Dependencias: solo se rechaza el ciclo directo A↔B — **no** se construye detección de ciclos multi-salto.
- El Gantt de un proyecto **arranca vacío** al activarse — no importa retroactivamente tareas viejas con fecha. Una tarea solo aparece en el Gantt si `on_gantt = true`.
- Copy de UI en español; nombres de tabla/columna en `snake_case` (`Docs/70-Database/Naming-Conventions.md`).
- Este plan **no** incluye el link público de cliente ni la visibilidad de comentarios/adjuntos — eso es la Fase 2, plan separado (`2026-09-30-gantt-cliente-plan.md`), que depende de este.

---

### Task 1: Migración — columnas `gantt_enabled` / `on_gantt`

**Files:**
- Create: `supabase/migrations/056_gantt_flags.sql`

**Interfaces:**
- Produces: columnas `work_items.gantt_enabled boolean not null default false` y `work_items.on_gantt boolean not null default false`, consumidas por Task 4 (repos) en adelante.

- [ ] **Step 1: Escribir la migración**

```sql
-- 056_gantt_flags.sql
-- Gantt por proyecto (Fase 1): activación (`gantt_enabled`, solo relevante en
-- type='project') + marca de "esta tarea/subtarea vive en el Gantt"
-- (`on_gantt`). El Gantt arranca vacío al activarse: ninguna tarea existente
-- se marca on_gantt=true automáticamente (ver Docs/superpowers/specs/2026-09-30-gantt-proyectos-design.md).

alter table public.work_items add column gantt_enabled boolean not null default false;
alter table public.work_items add column on_gantt boolean not null default false;
```

- [ ] **Step 2: Aplicar la migración**

Usar la herramienta MCP de Supabase (mismo flujo que las migraciones previas de este proyecto):

```
mcp__supabase__apply_migration(name: "gantt_flags", query: <contenido del archivo>)
```

Verificar con `mcp__supabase__list_migrations` que `056_gantt_flags` aparece aplicada.

- [ ] **Step 3: Regenerar tipos TypeScript**

```
mcp__supabase__generate_typescript_types()
```

Pegar el resultado completo sobre `packages/db/src/types/database.ts` (reemplaza el archivo entero — es generado). Confirmar que `Tables<"work_items">` ahora incluye `gantt_enabled: boolean` y `on_gantt: boolean`.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: sin errores (el tipo `Tables<"work_items">` cambió pero nada lo consume todavía).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/056_gantt_flags.sql packages/db/src/types/database.ts
git commit -m "feat(proyectos): columnas gantt_enabled/on_gantt en work_items"
```

---

### Task 2: Migración — `work_item_dependencies`

**Files:**
- Create: `supabase/migrations/057_work_item_dependencies.sql`

**Interfaces:**
- Produces: tabla `work_item_dependencies` (`id`, `organization_id`, `work_item_id`, `depends_on_work_item_id`, `created_at`), consumida por Task 4.

- [ ] **Step 1: Escribir la migración**

```sql
-- 057_work_item_dependencies.sql
-- Dependencias/bloqueos básicos entre tareas del Gantt. Solo rechaza el ciclo
-- directo A↔B (constraint unique + check); sin motor de ciclos multi-salto —
-- ver Docs/superpowers/specs/2026-09-30-gantt-proyectos-design.md sección 4.

create table public.work_item_dependencies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  depends_on_work_item_id uuid not null references public.work_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint work_item_dependencies_no_self check (work_item_id <> depends_on_work_item_id),
  constraint work_item_dependencies_unique unique (work_item_id, depends_on_work_item_id)
);
create index work_item_dependencies_item_idx on public.work_item_dependencies(work_item_id);
create index work_item_dependencies_blocker_idx on public.work_item_dependencies(depends_on_work_item_id);

alter table public.work_item_dependencies enable row level security;

create policy work_item_dependencies_select on public.work_item_dependencies
  for select using (organization_id in (select public.current_user_organization_ids()));
create policy work_item_dependencies_write on public.work_item_dependencies
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('project.manage')
  );
```

- [ ] **Step 2: Aplicar la migración**

```
mcp__supabase__apply_migration(name: "work_item_dependencies", query: <contenido del archivo>)
```

- [ ] **Step 3: Regenerar tipos y typecheck**

```
mcp__supabase__generate_typescript_types()
```

Sobreescribir `packages/db/src/types/database.ts`. Luego:

Run: `pnpm --filter @agency-os/db typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/057_work_item_dependencies.sql packages/db/src/types/database.ts
git commit -m "feat(proyectos): tabla work_item_dependencies con RLS"
```

---

### Task 3: Lógica pura de cascada y posición (domain)

**Files:**
- Create: `packages/domain/src/gantt.ts`
- Test: `packages/domain/src/gantt.test.ts`
- Modify: `packages/domain/src/index.ts` (agregar `export * from "./gantt";`)

**Interfaces:**
- Consumes: nada (funciones puras, sin dependencias externas).
- Produces:
  - `interface GanttTaskDates { id: string; startDate: string; dueDate: string }`
  - `interface DependencyEdge { workItemId: string; dependsOnWorkItemId: string }`
  - `interface CascadeUpdate { id: string; startDate: string; dueDate: string }`
  - `isSelfDependency(workItemId: string, dependsOnWorkItemId: string): boolean`
  - `isDirectCycle(edges: DependencyEdge[], candidate: DependencyEdge): boolean`
  - `cascadeForwardShift(tasks: GanttTaskDates[], edges: DependencyEdge[], movedId: string): CascadeUpdate[]`
  - `dayOffset(fromIso: string, toIso: string): number`
  - `barWidthDays(startIso: string, dueIso: string): number` (inclusivo, mínimo 1)

- [ ] **Step 1: Escribir los tests (fallando)**

```typescript
// packages/domain/src/gantt.test.ts
import { describe, expect, it } from "vitest";
import {
  barWidthDays,
  cascadeForwardShift,
  dayOffset,
  isDirectCycle,
  isSelfDependency,
} from "./gantt";

describe("isSelfDependency", () => {
  it("es true cuando una tarea depende de sí misma", () => {
    expect(isSelfDependency("a", "a")).toBe(true);
    expect(isSelfDependency("a", "b")).toBe(false);
  });
});

describe("isDirectCycle", () => {
  it("detecta el ciclo directo A depende de B, B ya dependía de A", () => {
    const edges = [{ workItemId: "b", dependsOnWorkItemId: "a" }];
    expect(isDirectCycle(edges, { workItemId: "a", dependsOnWorkItemId: "b" })).toBe(true);
  });

  it("no marca ciclo si la relación no es directa", () => {
    const edges = [{ workItemId: "b", dependsOnWorkItemId: "a" }];
    expect(isDirectCycle(edges, { workItemId: "c", dependsOnWorkItemId: "a" })).toBe(false);
  });
});

describe("dayOffset / barWidthDays", () => {
  it("cuenta días entre dos fechas ISO", () => {
    expect(dayOffset("2026-01-01", "2026-01-06")).toBe(5);
  });

  it("el ancho de barra es inclusivo (mismo día = 1)", () => {
    expect(barWidthDays("2026-01-06", "2026-01-06")).toBe(1);
    expect(barWidthDays("2026-01-06", "2026-01-20")).toBe(15);
  });
});

describe("cascadeForwardShift", () => {
  it("empuja hacia adelante a la tarea bloqueada cuando la bloqueante se atrasa", () => {
    const tasks = [
      { id: "design", startDate: "2026-01-06", dueDate: "2026-01-25" }, // se atrasó 5 días (era 01-20)
      { id: "dev", startDate: "2026-01-15", dueDate: "2026-02-05" },
    ];
    const edges = [{ workItemId: "dev", dependsOnWorkItemId: "design" }];
    const result = cascadeForwardShift(tasks, edges, "design");
    expect(result).toEqual([{ id: "dev", startDate: "2026-01-25", dueDate: "2026-02-15" }]);
  });

  it("no acorta la tarea bloqueada si la bloqueante se adelanta", () => {
    const tasks = [
      { id: "design", startDate: "2026-01-06", dueDate: "2026-01-10" }, // se adelantó (era 01-20)
      { id: "dev", startDate: "2026-01-15", dueDate: "2026-02-05" },
    ];
    const edges = [{ workItemId: "dev", dependsOnWorkItemId: "design" }];
    expect(cascadeForwardShift(tasks, edges, "design")).toEqual([]);
  });

  it("se propaga transitivamente por la cadena", () => {
    const tasks = [
      { id: "design", startDate: "2026-01-06", dueDate: "2026-01-25" },
      { id: "dev", startDate: "2026-01-15", dueDate: "2026-02-05" },
      { id: "qa", startDate: "2026-02-01", dueDate: "2026-02-10" },
    ];
    const edges = [
      { workItemId: "dev", dependsOnWorkItemId: "design" },
      { workItemId: "qa", dependsOnWorkItemId: "dev" },
    ];
    const result = cascadeForwardShift(tasks, edges, "design");
    expect(result).toEqual([
      { id: "dev", startDate: "2026-01-25", dueDate: "2026-02-15" },
      { id: "qa", startDate: "2026-02-15", dueDate: "2026-02-24" },
    ]);
  });

  it("con varios bloqueantes, manda el de fecha de fin más tardía", () => {
    const tasks = [
      { id: "copy", startDate: "2026-01-01", dueDate: "2026-01-10" },
      { id: "design", startDate: "2026-01-01", dueDate: "2026-01-30" }, // el más tardío
      { id: "dev", startDate: "2026-01-05", dueDate: "2026-01-20" },
    ];
    const edges = [
      { workItemId: "dev", dependsOnWorkItemId: "copy" },
      { workItemId: "dev", dependsOnWorkItemId: "design" },
    ];
    const result = cascadeForwardShift(tasks, edges, "design");
    expect(result).toEqual([{ id: "dev", startDate: "2026-01-30", dueDate: "2026-02-14" }]);
  });
});
```

- [ ] **Step 2: Correr los tests y confirmar que fallan**

Run: `pnpm --filter @agency-os/domain test`
Expected: FAIL — `Cannot find module './gantt'`.

- [ ] **Step 3: Implementar**

```typescript
// packages/domain/src/gantt.ts
// Lógica pura de fechas/dependencias del Gantt de proyectos. Cero I/O: recibe
// snapshots de tareas/dependencias y devuelve qué cambiaría, sin tocar la DB
// (eso lo hace la server action que la consume, ver gantt-actions.ts).

export interface GanttTaskDates {
  id: string;
  startDate: string; // YYYY-MM-DD
  dueDate: string; // YYYY-MM-DD
}

export interface DependencyEdge {
  workItemId: string; // tarea bloqueada
  dependsOnWorkItemId: string; // tarea bloqueante
}

export interface CascadeUpdate {
  id: string;
  startDate: string;
  dueDate: string;
}

function toUTCDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function addDays(iso: string, days: number): string {
  const d = toUTCDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Días entre dos fechas ISO (`to` - `from`). */
export function dayOffset(fromIso: string, toIso: string): number {
  return Math.round((toUTCDate(toIso).getTime() - toUTCDate(fromIso).getTime()) / 86_400_000);
}

/** Ancho de la barra en días, inclusivo (mismo día = 1, nunca menor a 1). */
export function barWidthDays(startIso: string, dueIso: string): number {
  return Math.max(1, dayOffset(startIso, dueIso) + 1);
}

export function isSelfDependency(workItemId: string, dependsOnWorkItemId: string): boolean {
  return workItemId === dependsOnWorkItemId;
}

/** Solo detecta el ciclo DIRECTO (A↔B) — sin recorrido de grafo multi-salto,
 * a propósito (ver spec, sección "Fuera de alcance"). */
export function isDirectCycle(edges: DependencyEdge[], candidate: DependencyEdge): boolean {
  return edges.some(
    (e) =>
      e.workItemId === candidate.dependsOnWorkItemId && e.dependsOnWorkItemId === candidate.workItemId,
  );
}

/** Tras un cambio de fechas en `movedId`, empuja hacia ADELANTE (nunca acorta)
 * a sus dependientes directos y transitivos. Si una tarea tiene varios
 * bloqueantes, la restricción es el que tenga la fecha de fin más tardía.
 * Devuelve solo las tareas cuya fecha efectivamente cambió (sin incluir
 * `movedId`). No muta `tasks`. */
export function cascadeForwardShift(
  tasks: GanttTaskDates[],
  edges: DependencyEdge[],
  movedId: string,
): CascadeUpdate[] {
  const byId = new Map(tasks.map((t) => [t.id, { ...t }]));

  const dependentsOf = new Map<string, string[]>(); // blockerId -> [blockedId, ...]
  const blockersOf = new Map<string, string[]>(); // blockedId -> [blockerId, ...]
  for (const e of edges) {
    (dependentsOf.get(e.dependsOnWorkItemId) ?? dependentsOf.set(e.dependsOnWorkItemId, []).get(e.dependsOnWorkItemId)!).push(
      e.workItemId,
    );
    (blockersOf.get(e.workItemId) ?? blockersOf.set(e.workItemId, []).get(e.workItemId)!).push(
      e.dependsOnWorkItemId,
    );
  }

  const changed = new Map<string, CascadeUpdate>();
  const queue: string[] = [movedId];
  const queued = new Set<string>(queue);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    queued.delete(currentId);
    for (const blockedId of dependentsOf.get(currentId) ?? []) {
      const blocked = byId.get(blockedId);
      if (!blocked) continue;

      let latestBlockerDue = "";
      for (const blockerId of blockersOf.get(blockedId) ?? []) {
        const blocker = byId.get(blockerId);
        if (blocker && blocker.dueDate > latestBlockerDue) latestBlockerDue = blocker.dueDate;
      }
      if (!latestBlockerDue || blocked.startDate >= latestBlockerDue) continue; // solo empuja adelante

      const duration = dayOffset(blocked.startDate, blocked.dueDate);
      const newStart = latestBlockerDue;
      const newDue = addDays(newStart, duration);
      if (newStart === blocked.startDate && newDue === blocked.dueDate) continue;

      blocked.startDate = newStart;
      blocked.dueDate = newDue;
      byId.set(blockedId, blocked);
      changed.set(blockedId, { id: blockedId, startDate: newStart, dueDate: newDue });

      if (!queued.has(blockedId)) {
        queue.push(blockedId);
        queued.add(blockedId);
      }
    }
  }

  return Array.from(changed.values());
}
```

- [ ] **Step 4: Correr los tests y confirmar que pasan**

Run: `pnpm --filter @agency-os/domain test`
Expected: PASS (todos los `describe` de `gantt.test.ts`).

- [ ] **Step 5: Exportar desde el índice del paquete**

En `packages/domain/src/index.ts`, agregar junto a los demás `export *`:

```typescript
export * from "./gantt";
```

- [ ] **Step 6: Typecheck del paquete**

Run: `pnpm --filter @agency-os/domain build`
Expected: sin errores (el build de `domain` es `tsc`, ver `packages/domain/package.json`).

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/gantt.ts packages/domain/src/gantt.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): cascada de fechas y chequeo de ciclo directo para el Gantt"
```

---

### Task 4: Repositorios — dependencias, flags y lectura del Gantt

**Files:**
- Create: `packages/db/src/repositories/work-item-dependencies.ts`
- Modify: `packages/db/src/repositories/work-items.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: tipos `Tables`/`TablesInsert` regenerados en Task 1-2; `ProjectTaskRow`/`TASKS_SELECT` ya existentes en `work-items.ts`.
- Produces:
  - `type DependencyRow = Tables<"work_item_dependencies">`
  - `listDependenciesForProject(db: Db, projectId: string): Promise<DependencyRow[]>`
  - `insertDependency(db: Db, values: { organizationId: string; workItemId: string; dependsOnWorkItemId: string }): Promise<DependencyRow>`
  - `deleteDependency(db: Db, id: string): Promise<void>`
  - `setGanttEnabled(db: Db, projectId: string, enabled: boolean): Promise<void>`
  - `listGanttTasks(db: Db, projectId: string): Promise<ProjectTaskRow[]>` (tareas/subtareas con `on_gantt = true`)
  - `bulkUpdateGanttDates(db: Db, updates: { id: string; startDate: string; dueDate: string }[]): Promise<void>`
  - `CreateWorkItemInput` (existente) gana el campo opcional `onGantt?: boolean`
  - `WorkItemPatch` (existente) gana `on_gantt` a la lista de columnas permitidas

- [ ] **Step 1: Nuevo repo de dependencias**

```typescript
// packages/db/src/repositories/work-item-dependencies.ts
import type { Tables } from "../types/database";
import type { Db } from "./shared";

export type DependencyRow = Tables<"work_item_dependencies">;

/** Dependencias de todas las tareas de un proyecto (para armar los conectores
 * del Gantt y correr la cascada). Trae por `project_id` embebiendo el work
 * item bloqueado, ya que `work_item_dependencies` no tiene `project_id` propio. */
export async function listDependenciesForProject(db: Db, projectId: string): Promise<DependencyRow[]> {
  const { data, error } = await db
    .from("work_item_dependencies")
    .select("*, work_item:work_items!work_item_dependencies_work_item_id_fkey(project_id)")
    .returns<(DependencyRow & { work_item: { project_id: string } | null })[]>();
  if (error) throw error;
  return (data ?? []).filter((row) => row.work_item?.project_id === projectId);
}

export async function insertDependency(
  db: Db,
  values: { organizationId: string; workItemId: string; dependsOnWorkItemId: string },
): Promise<DependencyRow> {
  const { data, error } = await db
    .from("work_item_dependencies")
    .insert({
      organization_id: values.organizationId,
      work_item_id: values.workItemId,
      depends_on_work_item_id: values.dependsOnWorkItemId,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteDependency(db: Db, id: string): Promise<void> {
  const { error } = await db.from("work_item_dependencies").delete().eq("id", id);
  if (error) throw error;
}
```

Nota sobre `listDependenciesForProject`: filtrar en memoria por `project_id` (en vez de un `.eq` server-side) es necesario porque `work_item_dependencies` no tiene columna `project_id` propia — mismo motivo documentado en `ProjectRow`/`countProjectTasks` de `work-items.ts` para por qué ciertas relaciones de `work_items` se resuelven así. El volumen esperado por proyecto es bajo (decenas, no miles), así que no hace falta el patrón de paginación de 1000 usado en los conteos globales de la organización.

- [ ] **Step 2: Extender `work-items.ts`**

Modificar `CreateWorkItemInput` (agregar el campo) y `createWorkItem` (usarlo en el insert):

```typescript
export interface CreateWorkItemInput {
  orgId: string;
  projectId: string;
  parentId?: string | null;
  type: Extract<Enums<"work_item_type">, "task" | "subtask">;
  title: string;
  statusId?: string | null;
  priority?: Enums<"work_item_priority">;
  dueDate?: string | null;
  /** true cuando la tarea se crea desde la pestaña Gantt. */
  onGantt?: boolean;
}

export async function createWorkItem(db: Db, input: CreateWorkItemInput): Promise<string> {
  const { data, error } = await db
    .from("work_items")
    .insert({
      organization_id: input.orgId,
      type: input.type,
      project_id: input.projectId,
      parent_id: input.parentId ?? null,
      title: input.title,
      status_id: input.statusId ?? null,
      priority: input.priority ?? "normal",
      due_date: input.dueDate ?? null,
      on_gantt: input.onGantt ?? false,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}
```

Modificar `WorkItemPatch` para incluir `on_gantt`:

```typescript
export type WorkItemPatch = Partial<
  Pick<
    TablesUpdate<"work_items">,
    | "title"
    | "description"
    | "priority"
    | "status_id"
    | "start_date"
    | "due_date"
    | "estimated_minutes"
    | "sort_order"
    | "project_state"
    | "on_gantt"
  >
>;
```

Agregar al final del archivo (junto a `setProjectFolder`):

```typescript
/** Activa/desactiva la pestaña Gantt de un proyecto. No toca `on_gantt` de
 * ninguna tarea — activar el Gantt arranca vacío a propósito (ver spec). */
export async function setGanttEnabled(db: Db, projectId: string, enabled: boolean): Promise<void> {
  const { error } = await db.from("work_items").update({ gantt_enabled: enabled }).eq("id", projectId);
  if (error) throw error;
}

/** Tareas/subtareas de un proyecto marcadas `on_gantt = true`, con el mismo
 * shape que `getProject().tasks` (status + assignees embebidos) para poder
 * reusar los mismos componentes de UI. */
export async function listGanttTasks(db: Db, projectId: string): Promise<ProjectTaskRow[]> {
  const { data, error } = await db
    .from("work_items")
    .select(TASKS_SELECT)
    .eq("project_id", projectId)
    .in("type", ["task", "subtask"])
    .eq("on_gantt", true)
    .is("deleted_at", null)
    .order("start_date")
    .returns<ProjectTaskRow[]>();
  if (error) throw error;
  return data ?? [];
}

/** Aplica en bloque los corrimientos de fecha calculados por
 * `cascadeForwardShift` (`@agency-os/domain`). Varias filas con valores
 * distintos entre sí — no hay upsert de una sola llamada en PostgREST para
 * esto, así que se dispara una actualización por fila en paralelo (mismo
 * trade-off que otras operaciones "en bloque" del repo, ej. `setAssignees`). */
export async function bulkUpdateGanttDates(
  db: Db,
  updates: { id: string; startDate: string; dueDate: string }[],
): Promise<void> {
  await Promise.all(
    updates.map(async (u) => {
      const { error } = await db
        .from("work_items")
        .update({ start_date: u.startDate, due_date: u.dueDate })
        .eq("id", u.id);
      if (error) throw error;
    }),
  );
}
```

- [ ] **Step 3: Exportar el repo nuevo**

En `packages/db/src/index.ts`, junto a las demás líneas de `work-item*`:

```typescript
export * from "./repositories/work-item-dependencies";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repositories/work-item-dependencies.ts packages/db/src/repositories/work-items.ts packages/db/src/index.ts
git commit -m "feat(db): repos de dependencias, flags de Gantt y lectura de tareas on_gantt"
```

---

### Task 5: Server actions

**Files:**
- Create: `apps/web/lib/gantt-actions.ts`

**Interfaces:**
- Consumes: `requireProjectManager`-equivalent (reimplementado localmente, ver Step 1), `assertWorkItemInOrg`-equivalent local, repos de Task 4, `cascadeForwardShift`/`isSelfDependency`/`isDirectCycle` de `@agency-os/domain`, `resolveProjectLink` de `@/lib/resolve-task-link` (ya existe).
- Produces:
  - `enableGanttAction(projectId: string): Promise<ActionResult>`
  - `saveGanttTaskAction(input: GanttTaskInput): Promise<IdResult>`
  - `updateGanttTaskDatesAction(id: string, startDate: string, dueDate: string): Promise<ActionResult>`
  - `addDependencyAction(workItemId: string, dependsOnWorkItemId: string): Promise<ActionResult>`
  - `removeDependencyAction(id: string): Promise<ActionResult>`
  - `type GanttTaskInput` (consumida por Task 6, la UI del modal)

- [ ] **Step 1: Escribir el archivo completo**

```typescript
// apps/web/lib/gantt-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import {
  createWorkItem,
  deleteDependency,
  insertDependency,
  listDependenciesForProject,
  listGanttTasks,
  bulkUpdateGanttDates,
  setAssignees,
  setGanttEnabled,
  updateWorkItem,
  type Db,
  type Enums,
} from "@agency-os/db";
import { cascadeForwardShift, isDirectCycle, isSelfDependency, validateWorkItemTitle } from "@agency-os/domain";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { resolveProjectLink } from "@/lib/resolve-task-link";

export type ActionResult = { ok: true; error?: never } | { ok?: never; error: string };
export type IdResult = { id: string; error?: never } | { id?: never; error: string };

type ManagerAuth =
  | { organizationId: string; userId: string; error?: never }
  | { organizationId?: never; userId?: never; error: string };

async function requireProjectManager(): Promise<ManagerAuth> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "project.manage")) {
    return { error: "No tienes permiso para administrar proyectos." };
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  return { organizationId, userId: user.id };
}

/** Confirma que el work item existe, es de la organización, y devuelve su
 * `project_id` y `type` — mismo propósito que `assertWorkItemInOrg` de
 * `project-actions.ts`, reimplementado acá porque ese helper no está
 * exportado. */
async function assertWorkItemInOrg(
  db: Db,
  id: string,
  organizationId: string,
): Promise<{ projectId: string; type: Enums<"work_item_type"> } | null> {
  const { data, error } = await db
    .from("work_items")
    .select("organization_id, project_id, type")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.organization_id !== organizationId) return null;
  return { projectId: data.project_id, type: data.type };
}

/** Recalcula la cascada a partir de `movedId` y persiste los corrimientos.
 * Compartido por `saveGanttTaskAction` y `updateGanttTaskDatesAction`. */
async function applyCascade(db: Db, projectId: string, movedId: string): Promise<void> {
  const [tasks, deps] = await Promise.all([
    listGanttTasks(db, projectId),
    listDependenciesForProject(db, projectId),
  ]);
  const dated = tasks.filter((t) => t.start_date && t.due_date);
  if (!dated.some((t) => t.id === movedId)) return;

  const updates = cascadeForwardShift(
    dated.map((t) => ({ id: t.id, startDate: t.start_date!, dueDate: t.due_date! })),
    deps.map((d) => ({ workItemId: d.work_item_id, dependsOnWorkItemId: d.depends_on_work_item_id })),
    movedId,
  );
  if (updates.length > 0) await bulkUpdateGanttDates(db, updates);
}

/** Activa la pestaña Gantt de un proyecto. Arranca vacío: no marca ninguna
 * tarea existente como `on_gantt`. */
export async function enableGanttAction(projectId: string): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    const found = await assertWorkItemInOrg(db, projectId, auth.organizationId);
    if (!found || found.type !== "project") {
      return { error: "El proyecto no existe o no pertenece a tu organización." };
    }
    await setGanttEnabled(db, projectId, true);
    const link = await resolveProjectLink(db, projectId);
    if (link) revalidatePath(link);
    return { ok: true };
  } catch (error) {
    console.error("enableGanttAction", error);
    return { error: "No se pudo activar el Gantt. Intenta de nuevo." };
  }
}

export interface GanttTaskInput {
  /** id de la tarea existente; sin él, se crea una nueva. */
  id?: string;
  projectId: string;
  parentId?: string | null;
  title: string;
  statusId?: string | null;
  assigneeIds: string[];
  /** Obligatorias en el Gantt (a diferencia de Tablero/Lista). */
  startDate: string;
  dueDate: string;
  /** Set completo de bloqueantes deseado para esta tarea (reemplaza-todo,
   * mismo patrón que `assigneeIds`/`setAssignees`). */
  dependsOnIds: string[];
}

/** Crea o edita una tarea del Gantt: fuerza `on_gantt = true`, exige fechas,
 * reemplaza el set de dependencias entrantes, y corre la cascada hacia sus
 * dependientes tras guardar. */
export async function saveGanttTaskAction(input: GanttTaskInput): Promise<IdResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  const title = input.title.trim();
  const validation = validateWorkItemTitle(title);
  if (!validation.valid) return { error: validation.error ?? "Título inválido." };
  if (!input.startDate || !input.dueDate) return { error: "Fecha de inicio y fin son obligatorias." };
  if (input.dueDate < input.startDate) return { error: "La fecha de fin no puede ser anterior al inicio." };
  if (input.dependsOnIds.some((depId) => isSelfDependency(input.id ?? "", depId))) {
    return { error: "Una tarea no puede depender de sí misma." };
  }

  try {
    const db = await getSupabaseServerClient();
    const project = await assertWorkItemInOrg(db, input.projectId, auth.organizationId);
    if (!project || project.type !== "project") {
      return { error: "El proyecto no existe o no pertenece a tu organización." };
    }

    let id = input.id;
    if (id) {
      const found = await assertWorkItemInOrg(db, id, auth.organizationId);
      if (!found) return { error: "La tarea no existe o no pertenece a tu organización." };
      await updateWorkItem(db, id, {
        title,
        status_id: input.statusId ?? null,
        start_date: input.startDate,
        due_date: input.dueDate,
        on_gantt: true,
      });
    } else {
      id = await createWorkItem(db, {
        orgId: auth.organizationId,
        projectId: input.projectId,
        parentId: input.parentId ?? null,
        type: "task",
        title,
        statusId: input.statusId,
        dueDate: input.dueDate,
        onGantt: true,
      });
      await updateWorkItem(db, id, { start_date: input.startDate });
    }

    await setAssignees(db, id, auth.organizationId, input.assigneeIds);

    // Reemplaza el set de dependencias entrantes: borra las actuales de esta
    // tarea e inserta las nuevas, validando ciclo directo contra las que
    // quedan vigentes de OTRAS tareas del proyecto.
    const existing = await listDependenciesForProject(db, input.projectId);
    await Promise.all(
      existing.filter((d) => d.work_item_id === id).map((d) => deleteDependency(db, d.id)),
    );
    const remaining = existing.filter((d) => d.work_item_id !== id);
    for (const dependsOnId of input.dependsOnIds) {
      const candidate = { workItemId: id, dependsOnWorkItemId: dependsOnId };
      if (
        isDirectCycle(
          remaining.map((d) => ({ workItemId: d.work_item_id, dependsOnWorkItemId: d.depends_on_work_item_id })),
          candidate,
        )
      ) {
        return { error: `No se puede: crearía un ciclo de dependencia directo.` };
      }
      await insertDependency(db, {
        organizationId: auth.organizationId,
        workItemId: id,
        dependsOnWorkItemId: dependsOnId,
      });
    }

    await applyCascade(db, input.projectId, id);

    const link = await resolveProjectLink(db, input.projectId);
    if (link) revalidatePath(link);
    return { id };
  } catch (error) {
    console.error("saveGanttTaskAction", error);
    return { error: "No se pudo guardar la tarea. Intenta de nuevo." };
  }
}

/** Actualiza solo las fechas de una tarea del Gantt (drag de la barra) y corre
 * la cascada. Acción liviana separada de `saveGanttTaskAction` porque el drag
 * no toca título/estado/asignados/dependencias. */
export async function updateGanttTaskDatesAction(
  id: string,
  startDate: string,
  dueDate: string,
): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (!startDate || !dueDate) return { error: "Fecha de inicio y fin son obligatorias." };
  if (dueDate < startDate) return { error: "La fecha de fin no puede ser anterior al inicio." };

  try {
    const db = await getSupabaseServerClient();
    const found = await assertWorkItemInOrg(db, id, auth.organizationId);
    if (!found) return { error: "La tarea no existe o no pertenece a tu organización." };

    await updateWorkItem(db, id, { start_date: startDate, due_date: dueDate });
    await applyCascade(db, found.projectId, id);

    const link = await resolveProjectLink(db, found.projectId);
    if (link) revalidatePath(link);
    return { ok: true };
  } catch (error) {
    console.error("updateGanttTaskDatesAction", error);
    return { error: "No se pudo mover la tarea. Intenta de nuevo." };
  }
}

export async function addDependencyAction(
  workItemId: string,
  dependsOnWorkItemId: string,
): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (isSelfDependency(workItemId, dependsOnWorkItemId)) {
    return { error: "Una tarea no puede depender de sí misma." };
  }

  try {
    const db = await getSupabaseServerClient();
    const found = await assertWorkItemInOrg(db, workItemId, auth.organizationId);
    if (!found) return { error: "La tarea no existe o no pertenece a tu organización." };

    const existing = await listDependenciesForProject(db, found.projectId);
    const candidate = { workItemId, dependsOnWorkItemId };
    const edges = existing.map((d) => ({
      workItemId: d.work_item_id,
      dependsOnWorkItemId: d.depends_on_work_item_id,
    }));
    if (isDirectCycle(edges, candidate)) {
      return { error: "Crearía un ciclo de dependencia directo." };
    }

    await insertDependency(db, { organizationId: auth.organizationId, workItemId, dependsOnWorkItemId });
    const link = await resolveProjectLink(db, found.projectId);
    if (link) revalidatePath(link);
    return { ok: true };
  } catch (error) {
    console.error("addDependencyAction", error);
    return { error: "No se pudo agregar la dependencia. Intenta de nuevo." };
  }
}

export async function removeDependencyAction(id: string): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    await deleteDependency(db, id);
    return { ok: true };
  } catch (error) {
    console.error("removeDependencyAction", error);
    return { error: "No se pudo quitar la dependencia. Intenta de nuevo." };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores. Si `resolveProjectLink` no está exportado desde `@/lib/resolve-task-link`, revisar el archivo — ya se usa igual en `project-actions.ts:334`, así que debería existir tal cual.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/gantt-actions.ts
git commit -m "feat(proyectos): server actions del Gantt (activar, guardar tarea, dependencias, cascada)"
```

---

### Task 6: UI — modal de crear/editar tarea del Gantt

**Files:**
- Create: `apps/web/components/proyectos/gantt-task-modal.tsx`

**Interfaces:**
- Consumes: `saveGanttTaskAction`, `GanttTaskInput` (Task 5); `BoardStatus`, `BoardOrgUser` (ya exportados desde `project-board.tsx`); `AssigneeMultiSelect` (ya existe en `./work-item-fields.tsx`).
- Produces: `GanttTask` (tipo de tarea usado por este modal y por Task 7), `GanttTaskModal` (componente), consumido por Task 7.

- [ ] **Step 1: Escribir el componente**

```typescript
// apps/web/components/proyectos/gantt-task-modal.tsx
"use client";

import { useState, useTransition } from "react";
import { Button, FieldError, Input, Label, Modal, Select } from "@agency-os/ui";
import { saveGanttTaskAction, type GanttTaskInput } from "@/lib/gantt-actions";
import type { BoardOrgUser, BoardStatus } from "./project-board";
import { AssigneeMultiSelect } from "./work-item-fields";

export interface GanttTask {
  id: string;
  parentId: string | null;
  title: string;
  statusId: string | null;
  startDate: string | null;
  dueDate: string | null;
  assigneeIds: string[];
  dependsOnIds: string[];
}

/** Selector simple de bloqueantes: checklist de las demás tareas del Gantt de
 * este proyecto (mismo patrón visual que `AssigneeMultiSelect`, sin buscador
 * porque el volumen esperado por proyecto es bajo). */
function BlockerMultiSelect({
  options,
  selectedIds,
  onToggle,
}: {
  options: { id: string; title: string }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
}) {
  if (options.length === 0) {
    return <p className="text-sm text-muted">No hay otras tareas en el Gantt todavía.</p>;
  }
  return (
    <div className="ds-scroll flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-line p-2">
      {options.map((o) => (
        <label key={o.id} className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={selectedIds.includes(o.id)}
            onChange={() => onToggle(o.id)}
          />
          {o.title}
        </label>
      ))}
    </div>
  );
}

export function GanttTaskModal({
  open,
  onClose,
  projectId,
  statuses,
  orgUsers,
  otherTasks,
  task,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  statuses: BoardStatus[];
  orgUsers: BoardOrgUser[];
  /** Resto de tareas del Gantt de este proyecto, para elegir bloqueantes. */
  otherTasks: { id: string; title: string }[];
  /** Tarea que se edita; null al crear. */
  task: GanttTask | null;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [statusId, setStatusId] = useState(task?.statusId ?? statuses[0]?.id ?? "");
  const [startDate, setStartDate] = useState(task?.startDate ?? "");
  const [dueDate, setDueDate] = useState(task?.dueDate ?? "");
  const [assigneeIds, setAssigneeIds] = useState<string[]>(task?.assigneeIds ?? []);
  const [dependsOnIds, setDependsOnIds] = useState<string[]>(task?.dependsOnIds ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const toggleAssignee = (id: string) =>
    setAssigneeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleDependsOn = (id: string) =>
    setDependsOnIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = () => {
    setError(null);
    if (!title.trim()) return setError("El título es obligatorio.");
    if (!startDate || !dueDate) return setError("Fecha de inicio y fin son obligatorias.");
    if (dueDate < startDate) return setError("La fecha de fin no puede ser anterior al inicio.");

    const input: GanttTaskInput = {
      id: task?.id,
      projectId,
      parentId: task?.parentId ?? null,
      title,
      statusId: statusId || null,
      assigneeIds,
      startDate,
      dueDate,
      dependsOnIds,
    };
    startTransition(async () => {
      const result = await saveGanttTaskAction(input);
      if (result.error) return setError(result.error);
      onSaved();
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={task ? "Editar tarea del Gantt" : "Agregar tarea al Gantt"} size="sm">
      <div className="space-y-4">
        {error && <FieldError>{error}</FieldError>}

        <div>
          <Label htmlFor="gantt-title">Nombre</Label>
          <Input id="gantt-title" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div>
          <Label htmlFor="gantt-status">Estado</Label>
          <Select id="gantt-status" value={statusId} onChange={(e) => setStatusId(e.target.value)}>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <Label htmlFor="gantt-start">Fecha inicio</Label>
            <Input
              id="gantt-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="gantt-due">Fecha fin</Label>
            <Input id="gantt-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>Responsables</Label>
          <AssigneeMultiSelect users={orgUsers} selectedIds={assigneeIds} onToggle={toggleAssignee} disabled={false} />
        </div>

        <div>
          <Label>Depende de (bloqueantes)</Label>
          <BlockerMultiSelect
            options={otherTasks.filter((t) => t.id !== task?.id)}
            selectedIds={dependsOnIds}
            onToggle={toggleDependsOn}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={onClose} disabled={pending}>
            Cancelar
          </Button>
          <Button variant="primary" onClick={submit} disabled={pending}>
            Guardar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores. Si `AssigneeMultiSelect` no está exportado desde `work-item-fields.tsx`, confirmar el nombre exacto del export (ya se usa igual en `work-item-editor.tsx`).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/proyectos/gantt-task-modal.tsx
git commit -m "feat(proyectos): modal de crear/editar tarea del Gantt"
```

---

### Task 7: UI — timeline del Gantt (lista + barras + drag)

**Files:**
- Create: `apps/web/components/proyectos/project-gantt.tsx`

**Interfaces:**
- Consumes: `GanttTask` (Task 6), `dayOffset`/`barWidthDays` (`@agency-os/domain`), `updateGanttTaskDatesAction`/`removeDependencyAction` (Task 5), `BoardStatus`/`BoardOrgUser` (`project-board.tsx`), `GanttTaskModal` (Task 6).
- Produces: `ProjectGantt` (componente), consumido por Task 8 (`project-board.tsx`).

- [ ] **Step 1: Escribir el componente**

```typescript
// apps/web/components/proyectos/project-gantt.tsx
"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Avatar, AvatarGroup, Button } from "@agency-os/ui";
import { barWidthDays, dayOffset } from "@agency-os/domain";
import { updateGanttTaskDatesAction } from "@/lib/gantt-actions";
import { GanttTaskModal, type GanttTask } from "./gantt-task-modal";
import type { BoardOrgUser, BoardStatus } from "./project-board";

const PX_PER_DAY = 10;
const ROW_HEIGHT = 44;

export interface GanttDependency {
  id: string;
  workItemId: string;
  dependsOnWorkItemId: string;
}

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Iniciales para el avatar (mismo criterio que `project-board.tsx`). */
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0];
  if (!first) return "—";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? first;
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}

type DragMode = "move" | "resize-start" | "resize-end";

export function ProjectGantt({
  projectId,
  tasks,
  statuses,
  orgUsers,
  canManage,
}: {
  projectId: string;
  tasks: GanttTask[];
  dependencies: GanttDependency[];
  statuses: BoardStatus[];
  orgUsers: BoardOrgUser[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<GanttTask | null | "new">(null);
  const [error, setError] = useState<string | null>(null);
  const dragState = useRef<{
    id: string;
    mode: DragMode;
    startX: number;
    originalStart: string;
    originalDue: string;
  } | null>(null);
  const [dragPreview, setDragPreview] = useState<{ id: string; startDate: string; dueDate: string } | null>(null);
  // `mouseup` corre en el mismo listener creado en `mousedown`, así que lee un
  // `dragPreview` (state) congelado en el valor de ESE render — nunca ve las
  // actualizaciones que `mousemove` fue disparando. Se necesita un ref en
  // paralelo al state (el state es solo para pintar la barra en cada frame).
  const latestPreviewRef = useRef<{ id: string; startDate: string; dueDate: string } | null>(null);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const avatarByUserId = useMemo(
    () => new Map(orgUsers.map((u) => [u.id, { name: u.name, avatarUrl: u.avatarUrl ?? null }])),
    [orgUsers],
  );

  const dated = tasks.filter((t) => t.startDate && t.dueDate);
  const projectStart = dated.length > 0 ? dated.reduce((min, t) => (t.startDate! < min ? t.startDate! : min), dated[0]!.startDate!) : null;

  const topTasks = tasks.filter((t) => !t.parentId);
  const childrenByParent = useMemo(() => {
    const map = new Map<string, GanttTask[]>();
    for (const t of tasks) {
      if (!t.parentId) continue;
      (map.get(t.parentId) ?? map.set(t.parentId, []).get(t.parentId)!).push(t);
    }
    return map;
  }, [tasks]);

  const orderedRows: { task: GanttTask; depth: number }[] = [];
  for (const t of topTasks) {
    orderedRows.push({ task: t, depth: 0 });
    for (const child of childrenByParent.get(t.id) ?? []) orderedRows.push({ task: child, depth: 1 });
  }

  const commitDates = async (id: string, startDate: string, dueDate: string) => {
    const result = await updateGanttTaskDatesAction(id, startDate, dueDate);
    setDragPreview(null);
    if (result.error) {
      setError(result.error);
      return;
    }
    router.refresh();
  };

  const onBarMouseDown = (task: GanttTask, mode: DragMode) => (e: React.MouseEvent) => {
    if (!canManage || !task.startDate || !task.dueDate) return;
    e.preventDefault();
    dragState.current = {
      id: task.id,
      mode,
      startX: e.clientX,
      originalStart: task.startDate,
      originalDue: task.dueDate,
    };

    const onMouseMove = (moveEvent: MouseEvent) => {
      const state = dragState.current;
      if (!state) return;
      const deltaDays = Math.round((moveEvent.clientX - state.startX) / PX_PER_DAY);
      let nextStart = state.originalStart;
      let nextDue = state.originalDue;
      if (state.mode === "move") {
        nextStart = addDaysIso(state.originalStart, deltaDays);
        nextDue = addDaysIso(state.originalDue, deltaDays);
      } else if (state.mode === "resize-start") {
        nextStart = addDaysIso(state.originalStart, deltaDays);
        if (nextStart > nextDue) nextStart = nextDue;
      } else {
        nextDue = addDaysIso(state.originalDue, deltaDays);
        if (nextDue < nextStart) nextDue = nextStart;
      }
      const next = { id: state.id, startDate: nextStart, dueDate: nextDue };
      latestPreviewRef.current = next;
      setDragPreview(next);
    };

    const onMouseUp = () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      const state = dragState.current;
      dragState.current = null;
      if (!state) return;
      const preview = latestPreviewRef.current;
      latestPreviewRef.current = null;
      if (preview && preview.id === state.id) {
        void commitDates(state.id, preview.startDate, preview.dueDate);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  if (!projectStart) {
    return (
      <div className="rounded-lg border border-line bg-glass p-6 text-center text-sm text-muted backdrop-blur-xl">
        Todavía no hay tareas en el Gantt.
        {canManage && (
          <div className="mt-3">
            <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
              + Agregar tarea
            </Button>
          </div>
        )}
        {editing !== null && (
          <GanttTaskModal
            open
            onClose={() => setEditing(null)}
            projectId={projectId}
            statuses={statuses}
            orgUsers={orgUsers}
            otherTasks={tasks.map((t) => ({ id: t.id, title: t.title }))}
            task={editing === "new" ? null : editing}
            onSaved={() => {
              setEditing(null);
              router.refresh();
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div>
      {error && (
        <div className="mb-3 rounded-md border border-danger/40 bg-glass px-4 py-2 text-sm text-danger backdrop-blur-xl">
          {error}
        </div>
      )}

      {canManage && (
        <div className="mb-3 flex justify-end">
          <Button variant="primary" size="sm" onClick={() => setEditing("new")}>
            + Agregar tarea
          </Button>
        </div>
      )}

      <div className="ds-scroll flex overflow-x-auto rounded-lg border border-line bg-glass backdrop-blur-xl">
        <div className="w-[300px] shrink-0 border-r border-line">
          {orderedRows.map(({ task, depth }) => (
            <div
              key={task.id}
              style={{ height: ROW_HEIGHT, paddingLeft: depth * 20 }}
              className="flex cursor-pointer flex-col justify-center border-b border-line px-3 hover:bg-glass"
              onClick={() => setEditing(task)}
            >
              <div className="flex items-center gap-2">
                <span className="truncate text-[13px] font-bold text-ink">{task.title}</span>
                {task.assigneeIds.length > 0 && (
                  <AvatarGroup>
                    {task.assigneeIds.slice(0, 3).map((id) => {
                      const info = avatarByUserId.get(id);
                      return (
                        <Avatar key={id} size="xs" initials={initialsOf(info?.name ?? "—")} src={info?.avatarUrl} />
                      );
                    })}
                  </AvatarGroup>
                )}
              </div>
              <span className="text-[11px] text-muted">
                {task.startDate ?? "—"} · {task.dueDate ?? "—"}
              </span>
            </div>
          ))}
        </div>

        <div className="relative" style={{ height: orderedRows.length * ROW_HEIGHT }}>
          {orderedRows.map(({ task }, index) => {
            const preview = dragPreview?.id === task.id ? dragPreview : null;
            const startDate = preview?.startDate ?? task.startDate;
            const dueDate = preview?.dueDate ?? task.dueDate;
            if (!startDate || !dueDate) return null;
            const status = task.statusId ? statusById.get(task.statusId) : null;
            const left = dayOffset(projectStart, startDate) * PX_PER_DAY;
            const width = barWidthDays(startDate, dueDate) * PX_PER_DAY;
            return (
              <div
                key={task.id}
                className={`absolute flex items-center rounded-md px-2 text-xs font-semibold text-white ${
                  canManage ? "cursor-grab active:cursor-grabbing" : ""
                }`}
                style={{
                  left,
                  width,
                  top: index * ROW_HEIGHT + 6,
                  height: ROW_HEIGHT - 12,
                  backgroundColor: status?.color ?? "#9aa1ab",
                }}
                onMouseDown={onBarMouseDown(task, "move")}
                title={`${barWidthDays(startDate, dueDate)} días`}
              >
                {canManage && (
                  <div
                    className="absolute left-0 top-0 h-full w-2 cursor-ew-resize"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onBarMouseDown(task, "resize-start")(e);
                    }}
                  />
                )}
                <span className="truncate">{task.title}</span>
                {canManage && (
                  <div
                    className="absolute right-0 top-0 h-full w-2 cursor-ew-resize"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      onBarMouseDown(task, "resize-end")(e);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {editing !== null && (
        <GanttTaskModal
          open
          onClose={() => setEditing(null)}
          projectId={projectId}
          statuses={statuses}
          orgUsers={orgUsers}
          otherTasks={tasks.map((t) => ({ id: t.id, title: t.title }))}
          task={editing === "new" ? null : editing}
          onSaved={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
```

Nota de alcance: los conectores visuales (línea/flecha) entre barras dependientes y el header de meses quedan simplificados en esta v1 — la tarjeta izquierda ya deja ver fechas y el drag ya dispara la cascada correctamente (que es la parte funcional crítica). Si Yesid pide el conector visual o el header de meses tras probarlo, es un ajuste incremental sobre este mismo archivo, no un cambio de arquitectura. `removeDependencyAction` queda importado y disponible para cuando se agregue la UI de gestión de dependencias existentes (hoy se gestionan solo desde `GanttTaskModal` al guardar).

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores. Prestar atención al import no usado `removeDependencyAction` — si el linter/typecheck lo marca como error (no solo warning), quitar el import hasta que Task futura lo use, o dejarlo con `// eslint-disable-next-line` según la convención del proyecto (revisar cómo se resuelven imports no usados en otros archivos del repo antes de decidir).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/proyectos/project-gantt.tsx
git commit -m "feat(proyectos): timeline del Gantt con drag de barras y cascada"
```

---

### Task 8: Wiring — pestaña, activación y carga de datos

**Files:**
- Modify: `apps/web/components/proyectos/project-board.tsx`
- Modify: `apps/web/app/(app)/proyectos/[cliente]/[proyecto]/page.tsx`
- Modify: `packages/db/src/repositories/work-items.ts` (agregar `gantt_enabled` a `ProjectDetail` — ya viene incluido porque `getProject` hace `select("*, ...")`, no requiere cambio de query, solo confirmar el campo en el tipo)

**Interfaces:**
- Consumes: `ProjectGantt` (Task 7), `enableGanttAction` (Task 5), `listGanttTasks`/`listDependenciesForProject` (Task 4).
- Produces: proyecto navegable con pestaña "Gantt" funcional en `/proyectos/[cliente]/[proyecto]`.

- [ ] **Step 1: Agregar la pestaña y el botón de activación en `project-board.tsx`**

Modificar el `view` state (línea 113) para incluir `"gantt"`:

```typescript
const [view, setView] = useState<"board" | "list" | "statuses" | "gantt">("board");
```

Agregar las nuevas props a la firma de `ProjectBoard` (junto a `minutesByTask`):

```typescript
  ganttEnabled,
  ganttTasks,
  ganttDependencies,
}: {
  projectId: string;
  basePath: string;
  statuses: BoardStatus[];
  tasks: BoardTask[];
  orgUsers: BoardOrgUser[];
  canManage: boolean;
  canAssign: boolean;
  minutesByTask?: Record<string, number>;
  ganttEnabled: boolean;
  ganttTasks: GanttTask[];
  ganttDependencies: GanttDependency[];
}) {
```

Agregar los imports correspondientes al tope del archivo:

```typescript
import { ProjectGantt, type GanttDependency } from "./project-gantt";
import type { GanttTask } from "./gantt-task-modal";
import { enableGanttAction } from "@/lib/gantt-actions";
```

Junto al bloque de Chips (después del de "Estados", antes del cierre del `<div className="flex gap-2">`):

```typescript
          {ganttEnabled && (
            <Chip active={view === "gantt"} onClick={() => setView("gantt")}>
              Gantt
            </Chip>
          )}
```

Junto al botón "+ Nueva tarea" (donde dice `{canManage && view !== "statuses" && (`), agregar el botón de activación cuando todavía no está activado:

```typescript
        {canManage && !ganttEnabled && view !== "statuses" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              const result = await enableGanttAction(projectId);
              if (!result.error) {
                setView("gantt");
                router.refresh();
              }
            }}
          >
            Activar Gantt
          </Button>
        )}
```

Y en el bloque de renderizado condicional (`{view === "statuses" ? (...) : view === "board" ? (...) : ...}`), agregar la rama nueva antes del cierre:

```typescript
      ) : view === "gantt" ? (
        <ProjectGantt
          projectId={projectId}
          tasks={ganttTasks}
          dependencies={ganttDependencies}
          statuses={statuses}
          orgUsers={orgUsers}
          canManage={canManage}
        />
      ) : (
```

(la rama `list` existente pasa a ser el `else` final — revisar el archivo para insertar en el lugar correcto según cómo está escrita la cadena de `? :` hoy).

- [ ] **Step 2: Cargar los datos en `page.tsx`**

En `apps/web/app/(app)/proyectos/[cliente]/[proyecto]/page.tsx`, agregar a los imports:

```typescript
import { listGanttTasks, listDependenciesForProject } from "@agency-os/db";
import type { GanttTask } from "@/components/proyectos/gantt-task-modal";
import type { GanttDependency } from "@/components/proyectos/project-gantt";
```

Agregar las dos consultas al `Promise.all` existente (junto a `getProject`/`listOrgUsers`/etc.):

```typescript
  const [project, orgUserRows, projectMinutes, minutesByTask, ganttTaskRows, dependencyRows] = await Promise.all([
    getProject(db, projectId),
    organizationId ? listOrgUsers(db, organizationId) : Promise.resolve([]),
    sumMinutesByProject(db, projectId),
    sumMinutesByTask(db, projectId),
    projectId ? listGanttTasks(db, projectId) : Promise.resolve([]),
    projectId ? listDependenciesForProject(db, projectId) : Promise.resolve([]),
  ]);
```

Mapear los resultados al shape de `GanttTask`/`GanttDependency` (junto a donde ya se arma `tasks: BoardTask[]`):

```typescript
  const ganttTasks: GanttTask[] = ganttTaskRows.map((t) => ({
    id: t.id,
    parentId: t.parent_id,
    title: t.title,
    statusId: t.status_id,
    startDate: t.start_date,
    dueDate: t.due_date,
    assigneeIds: t.assignees.map((a) => a.user_id),
    dependsOnIds: dependencyRows.filter((d) => d.work_item_id === t.id).map((d) => d.depends_on_work_item_id),
  }));
  const ganttDependencies: GanttDependency[] = dependencyRows.map((d) => ({
    id: d.id,
    workItemId: d.work_item_id,
    dependsOnWorkItemId: d.depends_on_work_item_id,
  }));
```

Pasar las nuevas props al `<ProjectBoard>`:

```typescript
      <ProjectBoard
        projectId={project.id}
        basePath={canonical}
        statuses={statuses}
        tasks={tasks}
        orgUsers={orgUsers}
        canManage={hasPermission(user, "project.manage")}
        canAssign={hasPermission(user, "project.assign")}
        minutesByTask={minutesByTask}
        ganttEnabled={project.gantt_enabled}
        ganttTasks={ganttTasks}
        ganttDependencies={ganttDependencies}
      />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 4: Build**

Run: `pnpm --filter web build`
Expected: build exitoso (confirma que no hay errores de Server/Client Component boundary, imports rotos, etc.)

- [ ] **Step 5: Verificación manual (Yesid en el navegador)**

No se automatiza — según la convención de este proyecto, el QA de flujos de UI lo hace el usuario en su sesión de navegador, no Playwright/Chrome DevTools. Dejar corriendo `pnpm dev` y probar:
1. Abrir un proyecto sin Gantt activado → aparece el botón "Activar Gantt", no la pestaña.
2. Activarlo → aparece la pestaña "Gantt", arranca vacía.
3. Crear 2 tareas con fechas, marcar que la segunda depende de la primera.
4. Arrastrar la barra de la primera tarea para atrasarla → la segunda se corre automáticamente la misma cantidad de días.
5. Adelantar la primera tarea → la segunda NO se acorta.
6. Confirmar que las tareas del Gantt también aparecen en Tablero/Lista (misma fila de `work_items`).
7. Confirmar que una tarea vieja del proyecto (creada antes de activar el Gantt, con fecha) NO aparece en el Gantt.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/proyectos/project-board.tsx apps/web/app/\(app\)/proyectos/\[cliente\]/\[proyecto\]/page.tsx
git commit -m "feat(proyectos): pestaña Gantt integrada al proyecto (activación + datos)"
```

---

## Spec Coverage Check

- Activación por proyecto (spec §1) → Task 1, 5 (`enableGanttAction`), 8.
- `on_gantt` / misma fila que Tablero-Lista (spec §2) → Task 1, 4, 5.
- Jerarquía tarea/subtarea sin rollup automático (spec, nota de subtareas) → Task 7 (`orderedRows` con `depth`, cada fila con sus propias fechas).
- Color por estado, multi-asignado, drag nativo, sin librerías nuevas (spec §3) → Task 7.
- Dependencias + cascada solo-adelante + ciclo directo (spec §4) → Task 3, 4, 5.
- Link público / visibilidad de cliente (spec §5, §6) → **fuera de este plan**, ver `2026-09-30-gantt-cliente-plan.md` (Fase 2).
- Permisos reusados sin nuevos (spec "Permisos") → Task 5 (`requireProjectManager`), Task 7 (`canManage`).

Fuera de este plan a propósito (según el spec): link público con token, toggle de visibilidad de comentarios/adjuntos, conectores visuales de dependencia en el timeline (simplificado a tooltip/orden, ver nota en Task 7), header de meses del timeline.
