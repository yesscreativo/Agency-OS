# Checklist en work items — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** dar a cada tarea/subtarea de Proyectos una checklist simple de pasos (una sola lista, sin agrupar) que arma y tilda quien ejecuta el trabajo, con progreso visible en el detalle y en las tarjetas de tablero/lista.

**Architecture:** una tabla nueva `checklist_items` (hija de `work_items`, mismo patrón que `work_item_comments`/`work_item_attachments`), con RLS que permite escribir a `project.manage` **o** a un asignado del work item. El progreso se calcula con una función pura de dominio (`checklistProgress`) a partir de los ítems ya embebidos en las consultas existentes de `work_items` (`TASKS_SELECT`), sin round-trips nuevos. La UI reutiliza el patrón de lista editable + drag&drop ya existente en `project-status-manager.tsx`.

**Tech Stack:** Next.js 14 App Router (Server Actions), Supabase Postgres + RLS, TypeScript, Vitest (dominio), Tailwind (UI existente de `@agency-os/ui`).

## Global Constraints

- Migración numerada `036_checklist_items.sql` — **antes de crear el archivo**, correr `mcp__supabase__list_migrations` (proyecto `hicbkpwywwhnhiawulmu`) y usar el siguiente número real si ya existe una migración `036+` aplicada por otro trabajo en curso (precedente: 028→033 se renumeró en la sesión de time tracking).
- Tipos de `packages/db/src/types/database.ts` se regeneran con `mcp__supabase__generate_typescript_types` después de aplicar la migración — **nunca a mano** (ver nota de la memoria del proyecto sobre Áreas/Cargos).
- Cero tests de repositorio en este monorepo (no existen `*.test.ts` en `packages/db`); solo `packages/domain` tiene Vitest. No introducir el patrón nuevo aquí.
- Todas las server actions nuevas siguen el patrón `{ ok: true } | { error: string }` (o `{ item: ... } | { error: string }`) ya usado en `work-item-comment-actions.ts`/`project-actions.ts` — sin excepciones lanzadas al llamador.
- `project_id`: `hicbkpwywwhnhiawulmu` (proyecto Supabase `agency-os`, dev).

---

### Task 1: Migración de base de datos — tabla `checklist_items` + RLS

**Files:**
- Create: `supabase/migrations/036_checklist_items.sql` (verificar número real primero, ver Global Constraints)

**Interfaces:**
- Produces: tabla `public.checklist_items(id, organization_id, work_item_id, label, sort_order, is_completed, completed_by, completed_at, created_by, created_at, updated_at, deleted_at)`. Todas las tareas siguientes dependen de que esta tabla y sus tipos TS existan.

- [ ] **Step 1: Verificar el número de migración real**

Correr `mcp__supabase__list_migrations` con `project_id: "hicbkpwywwhnhiawulmu"`. Confirmar que la última migración aplicada es `035_fix_people_manager_update_scope` (o la que sea al momento de ejecutar). Si hay una migración `036` o superior ya aplicada por otro trabajo concurrente, usar el siguiente número libre en el nombre del archivo de este Task (y en el resto del plan, mentalmente sustituir `036` por ese número).

- [ ] **Step 2: Escribir la migración**

Crear `supabase/migrations/036_checklist_items.sql`:

```sql
-- Checklist en work items (ClickUp Parity Fase B, sección 3, retomada). Una
-- sola lista simple de pasos por tarea/subtarea (sin checklists nombradas ni
-- agrupación). El ejecutor (asignado al work item) puede escribir su propia
-- checklist sin necesitar project.manage; project.manage siempre puede
-- escribir cualquiera. Ver Docs/superpowers/specs/2026-09-08-checklist-items-design.md.
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
create index checklist_items_item_idx
  on public.checklist_items(work_item_id, sort_order)
  where deleted_at is null;

alter table public.checklist_items enable row level security;

create policy checklist_items_select on public.checklist_items
  for select using (organization_id in (select public.current_user_organization_ids()));

-- Escritura: project.manage (cualquier checklist) O ser asignado del work item
-- (el ejecutor arma/tilda la suya propia, sin necesitar el permiso amplio).
create policy checklist_items_write on public.checklist_items
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and (
      public.current_user_has_permission('project.manage')
      or exists (
        select 1 from public.work_item_assignees wa
        where wa.work_item_id = checklist_items.work_item_id
        and wa.user_id = auth.uid()
      )
    )
  );
```

- [ ] **Step 3: Aplicar la migración al proyecto Supabase real**

Usar `mcp__supabase__apply_migration` con `project_id: "hicbkpwywwhnhiawulmu"`, `name: "checklist_items"` y el contenido SQL de arriba.

- [ ] **Step 4: Verificar que se aplicó sin errores**

Correr `mcp__supabase__get_advisors` con `type: "security"` sobre el mismo proyecto y confirmar que no aparece ninguna advertencia nueva referida a `checklist_items` (RLS habilitada + policies presentes ya cubren el patrón estándar del resto de tablas hijas de `work_items`).

- [ ] **Step 5: Regenerar los tipos TypeScript**

Correr `mcp__supabase__generate_typescript_types` con `project_id: "hicbkpwywwhnhiawulmu"` y escribir el resultado completo en `packages/db/src/types/database.ts` (reemplaza el archivo entero — es generado, no se edita a mano). Confirmar que el tipo `Tables<"checklist_items">` existe tras la regeneración (buscar `checklist_items:` en el archivo).

- [ ] **Step 6: Typecheck de `packages/db`**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: sin errores (el paquete no referencia `checklist_items` todavía, así que esto solo confirma que el archivo de tipos regenerado es válido).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/036_checklist_items.sql packages/db/src/types/database.ts
git commit -m "feat(proyectos): tabla checklist_items + RLS"
```

---

### Task 2: Dominio — `checklistProgress`

**Files:**
- Create: `packages/domain/src/checklist.ts`
- Create: `packages/domain/src/checklist.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces: `checklistProgress(items: { isCompleted: boolean }[]): { completed: number; total: number }` — la usan el Task 6 (UI del detalle) y el Task 7 (chip de tablero/lista).

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/domain/src/checklist.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { checklistProgress } from "./checklist";

describe("checklistProgress", () => {
  it("vacío: 0/0", () => {
    expect(checklistProgress([])).toEqual({ completed: 0, total: 0 });
  });

  it("cuenta completados y total", () => {
    const items = [
      { isCompleted: true },
      { isCompleted: false },
      { isCompleted: true },
    ];
    expect(checklistProgress(items)).toEqual({ completed: 2, total: 3 });
  });

  it("todos completados", () => {
    const items = [{ isCompleted: true }, { isCompleted: true }];
    expect(checklistProgress(items)).toEqual({ completed: 2, total: 2 });
  });

  it("ninguno completado", () => {
    const items = [{ isCompleted: false }, { isCompleted: false }];
    expect(checklistProgress(items)).toEqual({ completed: 0, total: 2 });
  });
});
```

- [ ] **Step 2: Correr el test y verificar que falla**

Run: `pnpm --filter @agency-os/domain test -- checklist`
Expected: FAIL con "Cannot find module './checklist'" (o similar, el archivo `checklist.ts` no existe todavía).

- [ ] **Step 3: Implementación mínima**

Crear `packages/domain/src/checklist.ts`:

```ts
export interface ChecklistProgress {
  completed: number;
  total: number;
}

/** Progreso de una checklist: completados vs. total. Los ítems ya deben venir
 * filtrados sin los borrados (deleted_at) — esta función no filtra nada. */
export function checklistProgress(items: { isCompleted: boolean }[]): ChecklistProgress {
  return {
    completed: items.filter((i) => i.isCompleted).length,
    total: items.length,
  };
}
```

- [ ] **Step 4: Exportar desde el índice del paquete**

En `packages/domain/src/index.ts`, agregar la línea (orden alfabético, junto a las demás):

```ts
export * from "./checklist";
```

- [ ] **Step 5: Correr el test y verificar que pasa**

Run: `pnpm --filter @agency-os/domain test -- checklist`
Expected: PASS, 4/4 tests.

- [ ] **Step 6: Typecheck del paquete**

Run: `pnpm --filter @agency-os/domain typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/checklist.ts packages/domain/src/checklist.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): checklistProgress"
```

---

### Task 3: Repositorio `checklist-items.ts`

**Files:**
- Create: `packages/db/src/repositories/checklist-items.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `Db` de `./shared`; `Tables`/`TablesInsert` de `../types/database` (generados en Task 1).
- Produces (usados por Task 5, las server actions):
  - `listChecklistItems(db: Db, workItemId: string): Promise<ChecklistItemRow[]>`
  - `getChecklistItem(db: Db, id: string): Promise<ChecklistItemRow | null>`
  - `insertChecklistItem(db: Db, values: { organizationId: string; workItemId: string; label: string; createdBy: string }): Promise<ChecklistItemRow>`
  - `toggleChecklistItem(db: Db, id: string, completed: boolean, userId: string): Promise<void>`
  - `updateChecklistItemLabel(db: Db, id: string, label: string): Promise<void>`
  - `deleteChecklistItem(db: Db, id: string): Promise<void>`
  - `reorderChecklistItems(db: Db, orderedIds: string[]): Promise<void>`
  - `isWorkItemAssignee(db: Db, workItemId: string, userId: string): Promise<boolean>`
  - Tipo `ChecklistItemRow = Tables<"checklist_items">`

- [ ] **Step 1: Crear el repositorio**

Crear `packages/db/src/repositories/checklist-items.ts`:

```ts
import type { Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type ChecklistItemRow = Tables<"checklist_items">;

/** Ítems no borrados de un work item, en orden. */
export async function listChecklistItems(db: Db, workItemId: string): Promise<ChecklistItemRow[]> {
  const { data, error } = await db
    .from("checklist_items")
    .select("*")
    .eq("work_item_id", workItemId)
    .is("deleted_at", null)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function getChecklistItem(db: Db, id: string): Promise<ChecklistItemRow | null> {
  const { data, error } = await db
    .from("checklist_items")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface InsertChecklistItemInput {
  organizationId: string;
  workItemId: string;
  label: string;
  createdBy: string;
}

/** Agrega un ítem al final de la lista (sort_order = máximo actual + 1). */
export async function insertChecklistItem(
  db: Db,
  values: InsertChecklistItemInput,
): Promise<ChecklistItemRow> {
  const existing = await listChecklistItems(db, values.workItemId);
  const sortOrder =
    existing.length > 0 ? Math.max(...existing.map((i) => i.sort_order)) + 1 : 0;
  const insertValues: TablesInsert<"checklist_items"> = {
    organization_id: values.organizationId,
    work_item_id: values.workItemId,
    label: values.label,
    sort_order: sortOrder,
    created_by: values.createdBy,
  };
  const { data, error } = await db
    .from("checklist_items")
    .insert(insertValues)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Tilda/destilda un ítem. Al destildar, limpia completed_by/completed_at. */
export async function toggleChecklistItem(
  db: Db,
  id: string,
  completed: boolean,
  userId: string,
): Promise<void> {
  const { error } = await db
    .from("checklist_items")
    .update({
      is_completed: completed,
      completed_by: completed ? userId : null,
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function updateChecklistItemLabel(db: Db, id: string, label: string): Promise<void> {
  const { error } = await db
    .from("checklist_items")
    .update({ label, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Soft delete (deleted_at), consistente con comentarios/adjuntos. */
export async function deleteChecklistItem(db: Db, id: string): Promise<void> {
  const { error } = await db
    .from("checklist_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Batch update de sort_order según el nuevo orden (mismo patrón que
 * reorderStatuses en work-item-statuses.ts). */
export async function reorderChecklistItems(db: Db, orderedIds: string[]): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await db
      .from("checklist_items")
      .update({ sort_order: index })
      .eq("id", id);
    if (error) throw error;
  }
}

/** ¿El usuario está asignado a este work item? Permite que el ejecutor (no
 * solo project.manage) escriba su propia checklist. */
export async function isWorkItemAssignee(
  db: Db,
  workItemId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("work_item_assignees")
    .select("user_id")
    .eq("work_item_id", workItemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
```

- [ ] **Step 2: Exportar desde el índice del paquete**

En `packages/db/src/index.ts`, agregar (junto al resto de repos de work items):

```ts
export * from "./repositories/checklist-items";
```

- [ ] **Step 3: Typecheck del paquete**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: sin errores. Si `Tables<"checklist_items">` no resuelve, revisar que el Task 1 (Step 5) regeneró bien `database.ts`.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/repositories/checklist-items.ts packages/db/src/index.ts
git commit -m "feat(db): repositorio checklist-items"
```

---

### Task 4: Embeber `checklist_items` en las consultas existentes de work items

**Files:**
- Modify: `packages/db/src/repositories/work-items.ts`

**Interfaces:**
- Consumes: tabla `checklist_items` (Task 1).
- Produces: `ProjectTaskRow.checklist_items: { id: string; label: string; is_completed: boolean; deleted_at: string | null }[]` — lo consumen Task 6 (detalle de tarea) y Task 7 (chip de tablero/lista).

- [ ] **Step 1: Ampliar el tipo `ProjectTaskRow`**

En `packages/db/src/repositories/work-items.ts`, ubicar (alrededor de la línea 176):

```ts
export type ProjectTaskRow = Tables<"work_items"> & {
  status: Pick<Tables<"work_item_statuses">, "id" | "label" | "color" | "is_done"> | null;
  assignees: WorkItemAssigneeRow[];
};
```

Reemplazar por:

```ts
export type ChecklistItemSummary = Pick<
  Tables<"checklist_items">,
  "id" | "label" | "is_completed" | "deleted_at"
>;

export type ProjectTaskRow = Tables<"work_items"> & {
  status: Pick<Tables<"work_item_statuses">, "id" | "label" | "color" | "is_done"> | null;
  assignees: WorkItemAssigneeRow[];
  checklist_items: ChecklistItemSummary[];
};
```

- [ ] **Step 2: Ampliar `TASKS_SELECT` con el embed**

En el mismo archivo, ubicar:

```ts
const TASKS_SELECT =
  "*, status:work_item_statuses!work_items_status_fk(id, label, color, is_done), assignees:work_item_assignees(user_id, users(id, person:people(full_name, email)))";
```

Reemplazar por:

```ts
const TASKS_SELECT =
  "*, status:work_item_statuses!work_items_status_fk(id, label, color, is_done), assignees:work_item_assignees(user_id, users(id, person:people(full_name, email))), checklist_items(id, label, is_completed, deleted_at)";
```

(Sin ambigüedad de FK aquí: a diferencia de `status`, `work_items↔checklist_items` tiene una sola relación, `checklist_items.work_item_id → work_items.id`.)

- [ ] **Step 3: Ordenar el embed por `sort_order`**

En `getProject`, ubicar la consulta de tareas:

```ts
    db
      .from("work_items")
      .select(TASKS_SELECT)
      .eq("project_id", id)
      .in("type", ["task", "subtask"])
      .is("deleted_at", null)
      .order("sort_order")
      .returns<ProjectTaskRow[]>(),
```

Agregar una línea `.order()` con `foreignTable` justo después del `.order("sort_order")` existente:

```ts
    db
      .from("work_items")
      .select(TASKS_SELECT)
      .eq("project_id", id)
      .in("type", ["task", "subtask"])
      .is("deleted_at", null)
      .order("sort_order")
      .order("sort_order", { foreignTable: "checklist_items" })
      .returns<ProjectTaskRow[]>(),
```

Repetir el mismo agregado (una línea `.order("sort_order", { foreignTable: "checklist_items" })`) en las otras dos consultas que usan `TASKS_SELECT` dentro de `getWorkItem`: la consulta principal (antes de `.maybeSingle<ProjectTaskRow>()`) y la de `subtasksResult` (antes de `.returns<ProjectTaskRow[]>()`).

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: sin errores.

- [ ] **Step 5: Verificación manual del embed**

Correr `mcp__supabase__execute_sql` (proyecto `hicbkpwywwhnhiawulmu`) con una query de lectura simple para confirmar que la tabla tiene la FK esperada:

```sql
select conname, confrelid::regclass, conrelid::regclass
from pg_constraint
where conrelid = 'public.checklist_items'::regclass and contype = 'f';
```

Expected: una fila con `confrelid = work_items` (o el nombre calificado equivalente) — confirma que PostgREST puede resolver el embed sin ambigüedad.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/repositories/work-items.ts
git commit -m "feat(db): embeber checklist_items en TASKS_SELECT"
```

---

### Task 5: Server actions `checklist-actions.ts`

**Files:**
- Create: `apps/web/lib/checklist-actions.ts`

**Interfaces:**
- Consumes: `checklist-items.ts` (Task 3) vía `@agency-os/db`; `getCurrentUser`/`hasPermission`/`CurrentUser` de `@/lib/auth`; `getSupabaseServerClient` de `@/lib/supabase-server`; `recordActivity` de `@agency-os/db`.
- Produces (usados por Task 6, la UI):
  - `addChecklistItem(workItemId: string, label: string): Promise<{ item: ChecklistItemRow } | { error: string }>`
  - `toggleChecklistItemAction(id: string, completed: boolean): Promise<{ ok: true } | { error: string }>`
  - `renameChecklistItemAction(id: string, label: string): Promise<{ ok: true } | { error: string }>`
  - `deleteChecklistItemAction(id: string): Promise<{ ok: true } | { error: string }>`
  - `reorderChecklistItemsAction(workItemId: string, orderedIds: string[]): Promise<{ ok: true } | { error: string }>`

- [ ] **Step 1: Crear el archivo de server actions**

Crear `apps/web/lib/checklist-actions.ts`:

```ts
"use server";

import {
  deleteChecklistItem,
  getChecklistItem,
  insertChecklistItem,
  isWorkItemAssignee,
  recordActivity,
  reorderChecklistItems,
  toggleChecklistItem,
  updateChecklistItemLabel,
  type ChecklistItemRow,
  type Db,
} from "@agency-os/db";
import { getCurrentUser, hasPermission, type CurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type ChecklistResult =
  | { item: ChecklistItemRow; error?: never }
  | { item?: never; error: string };
export type ActionResult = { ok: true; error?: never } | { ok?: never; error: string };

type ViewerAuth =
  | { user: CurrentUser; organizationId: string; error?: never }
  | { user?: never; organizationId?: never; error: string };

/** Leer/escribir la checklist parte de `project.view`; el gate fino de
 * escritura (manage o asignado) se resuelve por ítem en `canWriteChecklist`. */
async function requireProjectViewer(): Promise<ViewerAuth> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "project.view")) {
    return { error: "No tienes permiso para ver proyectos." };
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  return { user, organizationId };
}

/** project.manage escribe cualquier checklist; el resto solo si está asignado
 * al work item puntual (el ejecutor arma/tilda la suya). */
async function canWriteChecklist(db: Db, user: CurrentUser, workItemId: string): Promise<boolean> {
  if (hasPermission(user, "project.manage")) return true;
  return isWorkItemAssignee(db, workItemId, user.id);
}

async function loadWorkItem(
  db: Db,
  workItemId: string,
  organizationId: string,
): Promise<{ id: string; projectId: string } | null> {
  const { data, error } = await db
    .from("work_items")
    .select("id, project_id, organization_id")
    .eq("id", workItemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.organization_id !== organizationId) return null;
  return { id: data.id, projectId: data.project_id };
}

export async function addChecklistItem(workItemId: string, label: string): Promise<ChecklistResult> {
  const auth = await requireProjectViewer();
  if (auth.error !== undefined) return { error: auth.error };

  const trimmed = label.trim();
  if (!trimmed) return { error: "El texto no puede estar vacío." };

  try {
    const db = await getSupabaseServerClient();
    const workItem = await loadWorkItem(db, workItemId, auth.organizationId);
    if (!workItem) return { error: "La tarea no existe o no pertenece a tu organización." };
    if (!(await canWriteChecklist(db, auth.user, workItemId))) {
      return { error: "No tienes permiso para editar esta checklist." };
    }

    const item = await insertChecklistItem(db, {
      organizationId: auth.organizationId,
      workItemId,
      label: trimmed,
      createdBy: auth.user.id,
    });

    try {
      await recordActivity(db, {
        orgId: auth.organizationId,
        workItemId,
        actorUserId: auth.user.id,
        eventType: "checklist_item_added",
        payload: { label: trimmed },
      });
    } catch (error) {
      console.error("recordActivity:checklist_item_added", error);
    }

    return { item };
  } catch (error) {
    console.error("addChecklistItem", error);
    return { error: "No se pudo agregar el ítem. Intenta de nuevo." };
  }
}

export async function toggleChecklistItemAction(
  id: string,
  completed: boolean,
): Promise<ActionResult> {
  const auth = await requireProjectViewer();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    const item = await getChecklistItem(db, id);
    if (!item || item.organization_id !== auth.organizationId) {
      return { error: "El ítem no existe o no pertenece a tu organización." };
    }
    if (!(await canWriteChecklist(db, auth.user, item.work_item_id))) {
      return { error: "No tienes permiso para editar esta checklist." };
    }

    await toggleChecklistItem(db, id, completed, auth.user.id);

    if (completed) {
      try {
        await recordActivity(db, {
          orgId: auth.organizationId,
          workItemId: item.work_item_id,
          actorUserId: auth.user.id,
          eventType: "checklist_item_completed",
          payload: { label: item.label },
        });
      } catch (error) {
        console.error("recordActivity:checklist_item_completed", error);
      }
    }

    return { ok: true };
  } catch (error) {
    console.error("toggleChecklistItemAction", error);
    return { error: "No se pudo actualizar el ítem. Intenta de nuevo." };
  }
}

export async function renameChecklistItemAction(id: string, label: string): Promise<ActionResult> {
  const auth = await requireProjectViewer();
  if (auth.error !== undefined) return { error: auth.error };

  const trimmed = label.trim();
  if (!trimmed) return { error: "El texto no puede estar vacío." };

  try {
    const db = await getSupabaseServerClient();
    const item = await getChecklistItem(db, id);
    if (!item || item.organization_id !== auth.organizationId) {
      return { error: "El ítem no existe o no pertenece a tu organización." };
    }
    if (!(await canWriteChecklist(db, auth.user, item.work_item_id))) {
      return { error: "No tienes permiso para editar esta checklist." };
    }

    await updateChecklistItemLabel(db, id, trimmed);
    return { ok: true };
  } catch (error) {
    console.error("renameChecklistItemAction", error);
    return { error: "No se pudo renombrar el ítem. Intenta de nuevo." };
  }
}

export async function deleteChecklistItemAction(id: string): Promise<ActionResult> {
  const auth = await requireProjectViewer();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    const item = await getChecklistItem(db, id);
    if (!item || item.organization_id !== auth.organizationId) {
      return { error: "El ítem no existe o no pertenece a tu organización." };
    }
    if (!(await canWriteChecklist(db, auth.user, item.work_item_id))) {
      return { error: "No tienes permiso para editar esta checklist." };
    }

    await deleteChecklistItem(db, id);
    return { ok: true };
  } catch (error) {
    console.error("deleteChecklistItemAction", error);
    return { error: "No se pudo eliminar el ítem. Intenta de nuevo." };
  }
}

export async function reorderChecklistItemsAction(
  workItemId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const auth = await requireProjectViewer();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    const workItem = await loadWorkItem(db, workItemId, auth.organizationId);
    if (!workItem) return { error: "La tarea no existe o no pertenece a tu organización." };
    if (!(await canWriteChecklist(db, auth.user, workItemId))) {
      return { error: "No tienes permiso para editar esta checklist." };
    }

    await reorderChecklistItems(db, orderedIds);
    return { ok: true };
  } catch (error) {
    console.error("reorderChecklistItemsAction", error);
    return { error: "No se pudo reordenar la checklist. Intenta de nuevo." };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @agency-os/web typecheck`
Expected: sin errores (el archivo no se importa desde ninguna UI todavía, pero debe compilar solo).

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/checklist-actions.ts
git commit -m "feat(proyectos): server actions de checklist"
```

---

### Task 6: UI del detalle — `ChecklistPanel` + wiring en `work-item-detail.tsx`

**Files:**
- Create: `apps/web/components/proyectos/checklist-panel.tsx`
- Modify: `apps/web/components/proyectos/work-item-detail.tsx`
- Modify: `apps/web/app/(app)/proyectos/[cliente]/[proyecto]/tareas/[tarea]/page.tsx`

**Interfaces:**
- Consumes: `addChecklistItem`/`toggleChecklistItemAction`/`deleteChecklistItemAction`/`reorderChecklistItemsAction` (Task 5); `checklistProgress` (Task 2); `ProjectTaskRow.checklist_items` (Task 4).
- Produces: componente `ChecklistPanel({ workItemId, items, canWrite }: { workItemId: string; items: ChecklistItemView[]; canWrite: boolean })`, tipo `ChecklistItemView = { id: string; label: string; isCompleted: boolean }`.

- [ ] **Step 1: Crear el componente `ChecklistPanel`**

Crear `apps/web/components/proyectos/checklist-panel.tsx`:

```tsx
"use client";

// Checklist simple de una tarea/subtarea: una sola lista sin agrupar, que
// arma y tilda quien la ejecuta (asignado) o quien tiene project.manage. Mismo
// patrón visual que las secciones "Subtareas"/"Adjuntos" de work-item-detail.tsx
// y el mismo mecanismo de drag&drop que project-status-manager.tsx.

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@agency-os/ui";
import { checklistProgress } from "@agency-os/domain";
import {
  addChecklistItem,
  deleteChecklistItemAction,
  reorderChecklistItemsAction,
  toggleChecklistItemAction,
} from "@/lib/checklist-actions";

export interface ChecklistItemView {
  id: string;
  label: string;
  isCompleted: boolean;
}

function signatureOf(items: ChecklistItemView[]): string {
  return items.map((i) => `${i.id}:${i.label}:${i.isCompleted ? 1 : 0}`).join("|");
}

export function ChecklistPanel({
  workItemId,
  items,
  canWrite,
}: {
  workItemId: string;
  items: ChecklistItemView[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(items);
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const dragIndex = useRef<number | null>(null);

  // Tras router.refresh(), las props traen la verdad del server (mismo patrón
  // que ProjectStatusManager).
  const propsSignature = signatureOf(items);
  useEffect(() => {
    setRows(items);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [propsSignature]);

  const progress = checklistProgress(rows.map((r) => ({ isCompleted: r.isCompleted })));

  const onAdd = () => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setError(null);
    startTransition(async () => {
      const res = await addChecklistItem(workItemId, trimmed);
      if (res.error || !res.item) {
        setError(res.error ?? "No se pudo agregar el ítem.");
        return;
      }
      setRows((prev) => [
        ...prev,
        { id: res.item!.id, label: res.item!.label, isCompleted: res.item!.is_completed },
      ]);
      setLabel("");
      router.refresh();
    });
  };

  const onToggle = (id: string, completed: boolean) => {
    setError(null);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isCompleted: completed } : r)));
    startTransition(async () => {
      const res = await toggleChecklistItemAction(id, completed);
      if (res.error) {
        setError(res.error);
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isCompleted: !completed } : r)));
        return;
      }
      router.refresh();
    });
  };

  const onDelete = (id: string) => {
    setError(null);
    setRows((prev) => prev.filter((r) => r.id !== id));
    startTransition(async () => {
      const res = await deleteChecklistItemAction(id);
      if (res.error) setError(res.error);
      router.refresh();
    });
  };

  const onDrop = (index: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from === null || from === index) return;
    const next = [...rows];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(index, 0, moved);
    setRows(next);
    startTransition(async () => {
      const res = await reorderChecklistItemsAction(
        workItemId,
        next.map((r) => r.id),
      );
      if (res.error) setError(res.error);
      else router.refresh();
    });
  };

  return (
    <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-ink">Checklist</h2>
        {progress.total > 0 && (
          <span className="font-mono text-xs text-muted">
            {progress.completed}/{progress.total}
          </span>
        )}
      </div>

      {progress.total > 0 && (
        <div className="mt-2 h-1 w-full overflow-hidden rounded-pill bg-surface-2">
          <div
            className="h-full rounded-pill bg-green transition-all"
            style={{ width: `${(progress.completed / progress.total) * 100}%` }}
          />
        </div>
      )}

      {rows.length > 0 ? (
        <div className="mt-3 space-y-1">
          {rows.map((row, index) => (
            <div
              key={row.id}
              draggable={canWrite}
              onDragStart={() => (dragIndex.current = index)}
              onDragOver={(e) => canWrite && e.preventDefault()}
              onDrop={() => canWrite && onDrop(index)}
              className={`group flex items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-surface-2 ${
                canWrite ? "cursor-grab active:cursor-grabbing" : ""
              }`}
            >
              <input
                type="checkbox"
                checked={row.isCompleted}
                disabled={!canWrite || isPending}
                onChange={(e) => onToggle(row.id, e.target.checked)}
                aria-label={row.label}
                className="h-4 w-4 shrink-0 accent-[var(--green)]"
              />
              <span
                className={`flex-1 text-sm ${row.isCompleted ? "text-faint line-through" : "text-ink"}`}
              >
                {row.label}
              </span>
              {canWrite && (
                <button
                  type="button"
                  aria-label={`Quitar "${row.label}"`}
                  onClick={() => onDelete(row.id)}
                  className="text-muted opacity-0 transition hover:text-danger group-hover:opacity-100"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-sm text-faint">Sin ítems.</p>
      )}

      {canWrite && (
        <div className="mt-3">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                onAdd();
              }
            }}
            placeholder="+ Agregar ítem…"
            disabled={isPending}
          />
        </div>
      )}
      {error && <p className="mt-1 text-sm text-danger">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 2: Insertar la sección en `work-item-detail.tsx`**

En `apps/web/components/proyectos/work-item-detail.tsx`, agregar el import (junto a los demás de componentes locales, cerca de la línea 25):

```ts
import { ChecklistPanel, type ChecklistItemView } from "./checklist-panel";
```

Agregar `checklistItems: ChecklistItemView[]` al bloque de props del componente (junto a `comments`, `activity`, etc., alrededor de la línea 71-92):

```ts
  comments: PanelComment[];
  activity: PanelActivity[];
  timeEntries: TimeEntryDTO[];
  checklistItems: ChecklistItemView[];
```

y en la desestructuración de parámetros (alrededor de la línea 60-93), agregar `checklistItems,` junto a `comments, activity, timeEntries,`.

Insertar la sección entre "Descripción" y "Subtareas" (justo después del `</section>` que cierra Descripción, línea ~269, y antes del `{task.type === "task" && (` de Subtareas, línea ~271):

```tsx
        <ChecklistPanel
          workItemId={task.id}
          items={checklistItems}
          canWrite={canManage || task.assignees.some((a) => a.id === currentUserId)}
        />

```

- [ ] **Step 3: Mapear los datos en la página de la tarea**

En `apps/web/app/(app)/proyectos/[cliente]/[proyecto]/tareas/[tarea]/page.tsx`:

Agregar el import junto a los demás de `@/components/proyectos/...`:

```ts
import type { ChecklistItemView } from "@/components/proyectos/checklist-panel";
```

Después de construir `detailTask` (alrededor de la línea 112), agregar:

```ts
  const checklistItems: ChecklistItemView[] = task.checklist_items
    .filter((c) => !c.deleted_at)
    .map((c) => ({ id: c.id, label: c.label, isCompleted: c.is_completed }));
```

Y pasar la prop nueva al componente `<WorkItemDetail>` (junto a `timeEntries={timeEntries}`, alrededor de la línea 204):

```tsx
        checklistItems={checklistItems}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @agency-os/web typecheck`
Expected: sin errores.

- [ ] **Step 5: Lint**

Run: `pnpm --filter @agency-os/web lint`
Expected: sin errores nuevos.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/proyectos/checklist-panel.tsx apps/web/components/proyectos/work-item-detail.tsx "apps/web/app/(app)/proyectos/[cliente]/[proyecto]/tareas/[tarea]/page.tsx"
git commit -m "feat(proyectos): checklist en el detalle de la tarea"
```

---

### Task 7: Chip de progreso "N/M" en tablero y lista

**Files:**
- Modify: `apps/web/components/proyectos/project-board.tsx`
- Modify: `apps/web/app/(app)/proyectos/[cliente]/[proyecto]/page.tsx`

**Interfaces:**
- Consumes: `checklistProgress` (Task 2); `ProjectTaskRow.checklist_items` (Task 4).
- Produces: `BoardTask.checklistCompleted: number` y `BoardTask.checklistTotal: number`, consumidos dentro del propio `project-board.tsx`.

- [ ] **Step 1: Ampliar `BoardTask`**

En `apps/web/components/proyectos/project-board.tsx`, ubicar la interfaz `BoardTask` (línea 24-35):

```ts
export interface BoardTask {
  id: string;
  parentId: string | null;
  type: "task" | "subtask";
  title: string;
  description: string | null;
  statusId: string | null;
  priority: WorkItemPriority;
  startDate: string | null;
  dueDate: string | null;
  assignees: BoardAssignee[];
}
```

Agregar dos campos al final:

```ts
export interface BoardTask {
  id: string;
  parentId: string | null;
  type: "task" | "subtask";
  title: string;
  description: string | null;
  statusId: string | null;
  priority: WorkItemPriority;
  startDate: string | null;
  dueDate: string | null;
  assignees: BoardAssignee[];
  checklistCompleted: number;
  checklistTotal: number;
}
```

- [ ] **Step 2: Renderizar el chip en la tarjeta del tablero (vista Kanban)**

En el mismo archivo, ubicar el bloque de la tarjeta Kanban (dentro del `.map((t) => {...})` de la vista `board`, alrededor de la línea 300-318):

```tsx
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 text-[12px] text-muted">
                            {t.dueDate && (
                              <span
                                className={
                                  overdue ? "font-semibold text-danger" : undefined
                                }
                                title={overdue ? "Retrasada" : undefined}
                              >
                                {overdue && "⚠ "}
                                {formatDate(t.dueDate)}
                              </span>
                            )}
                            {subCount > 0 && (
                              <span className="rounded-pill border border-line-strong px-2 py-0.5 text-[11px]">
                                {subCount} subtarea{subCount === 1 ? "" : "s"}
                              </span>
                            )}
                          </div>
                          <AssigneeAvatars assignees={t.assignees} avatarByUserId={avatarByUserId} />
                        </div>
```

Agregar el chip de checklist justo después del chip de subtareas:

```tsx
                            {subCount > 0 && (
                              <span className="rounded-pill border border-line-strong px-2 py-0.5 text-[11px]">
                                {subCount} subtarea{subCount === 1 ? "" : "s"}
                              </span>
                            )}
                            {t.checklistTotal > 0 && (
                              <span className="rounded-pill border border-line-strong px-2 py-0.5 text-[11px]">
                                ✓ {t.checklistCompleted}/{t.checklistTotal}
                              </span>
                            )}
```

- [ ] **Step 3: Renderizar el chip en la vista Lista**

En la función `ListView` del mismo archivo, hay dos bloques casi idénticos: uno para la tarea padre (alrededor de la línea 408-427) y uno para cada subtarea hija (alrededor de la línea 440-460). En **ambos**, ubicar el bloque:

```tsx
                {Boolean(minutesByTask?.[t.id]) && (
                  <span className="font-mono text-[12px] tabular-nums text-muted">
                    {formatDuration(minutesByTask![t.id])}
                  </span>
                )}
                <AssigneeAvatars assignees={t.assignees} avatarByUserId={avatarByUserId} />
```

(la variante de la subtarea usa `c.id`/`c.assignees` en vez de `t.id`/`t.assignees`). Agregar el chip antes de `<AssigneeAvatars ...>`, en cada uno de los dos bloques:

Para la tarea padre:
```tsx
                {t.checklistTotal > 0 && (
                  <span className="font-mono text-[12px] tabular-nums text-muted">
                    ✓ {t.checklistCompleted}/{t.checklistTotal}
                  </span>
                )}
                <AssigneeAvatars assignees={t.assignees} avatarByUserId={avatarByUserId} />
```

Para la subtarea:
```tsx
                {c.checklistTotal > 0 && (
                  <span className="font-mono text-[12px] tabular-nums text-muted">
                    ✓ {c.checklistCompleted}/{c.checklistTotal}
                  </span>
                )}
                <AssigneeAvatars assignees={c.assignees} avatarByUserId={avatarByUserId} />
```

- [ ] **Step 4: Calcular los campos nuevos al mapear `BoardTask`**

En `apps/web/app/(app)/proyectos/[cliente]/[proyecto]/page.tsx`, agregar el import de `checklistProgress` junto al resto de `@agency-os/domain` (línea 3):

```ts
import { extractShortId, formatDuration, matchesShortId, checklistProgress } from "@agency-os/domain";
```

Ubicar el `.map()` que construye `tasks: BoardTask[]` (línea 87-103):

```ts
  const tasks: BoardTask[] = project.tasks.map((t) => ({
    id: t.id,
    parentId: t.parent_id,
    type: t.type === "subtask" ? "subtask" : "task",
    title: t.title,
    description: t.description,
    statusId: t.status_id,
    priority: t.priority,
    startDate: t.start_date,
    dueDate: t.due_date,
    assignees: t.assignees
      .filter((a) => a.users)
      .map((a) => ({
        id: a.user_id,
        name: a.users!.person?.full_name ?? a.users!.person?.email ?? "—",
      })),
  }));
```

Reemplazar por:

```ts
  const tasks: BoardTask[] = project.tasks.map((t) => {
    const checklist = checklistProgress(
      t.checklist_items.filter((c) => !c.deleted_at).map((c) => ({ isCompleted: c.is_completed })),
    );
    return {
      id: t.id,
      parentId: t.parent_id,
      type: t.type === "subtask" ? "subtask" : "task",
      title: t.title,
      description: t.description,
      statusId: t.status_id,
      priority: t.priority,
      startDate: t.start_date,
      dueDate: t.due_date,
      assignees: t.assignees
        .filter((a) => a.users)
        .map((a) => ({
          id: a.user_id,
          name: a.users!.person?.full_name ?? a.users!.person?.email ?? "—",
        })),
      checklistCompleted: checklist.completed,
      checklistTotal: checklist.total,
    };
  });
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @agency-os/web typecheck`
Expected: sin errores.

- [ ] **Step 6: Lint**

Run: `pnpm --filter @agency-os/web lint`
Expected: sin errores nuevos.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/proyectos/project-board.tsx "apps/web/app/(app)/proyectos/[cliente]/[proyecto]/page.tsx"
git commit -m "feat(proyectos): chip de progreso de checklist en tablero y lista"
```

---

### Task 8: Texto de actividad para los eventos de checklist

**Files:**
- Modify: `apps/web/components/proyectos/work-item-activity-panel.tsx`

**Interfaces:**
- Consumes: eventos `checklist_item_added`/`checklist_item_completed` emitidos por Task 5 (`recordActivity`, payload `{ label: string }`).

- [ ] **Step 1: Agregar los casos al switch de `activityText`**

En `apps/web/components/proyectos/work-item-activity-panel.tsx`, ubicar el `switch (a.eventType)` (línea 60-85):

```ts
    case "time_logged": {
      const mins = Number(p.minutes ?? 0);
      return mins > 0 ? `registró ${formatDuration(mins)}` : "registró tiempo";
    }
    default:
      return a.eventType;
```

Agregar dos casos nuevos antes de `default`:

```ts
    case "time_logged": {
      const mins = Number(p.minutes ?? 0);
      return mins > 0 ? `registró ${formatDuration(mins)}` : "registró tiempo";
    }
    case "checklist_item_added":
      return p.label ? `agregó "${String(p.label)}" a la checklist` : "agregó un ítem a la checklist";
    case "checklist_item_completed":
      return p.label ? `completó "${String(p.label)}"` : "completó un ítem de la checklist";
    default:
      return a.eventType;
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @agency-os/web typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/proyectos/work-item-activity-panel.tsx
git commit -m "feat(proyectos): texto de actividad para eventos de checklist"
```

---

### Task 9: Verificación final

**Files:** ninguno (solo comandos).

- [ ] **Step 1: Typecheck de todo el monorepo**

Run: `pnpm turbo run typecheck`
Expected: todos los paquetes en verde.

- [ ] **Step 2: Lint de todo el monorepo**

Run: `pnpm turbo run lint`
Expected: sin errores.

- [ ] **Step 3: Tests de dominio**

Run: `pnpm --filter @agency-os/domain test`
Expected: todos los tests verdes, incluidos los 4 nuevos de `checklistProgress`.

- [ ] **Step 4: Checklist manual para Yesid (no automatizable — login por Google, ver memoria del proyecto)**

Entregar este checklist para validar en el navegador con una cuenta real:
1. Abrir una tarea sin ítems de checklist → sección "Checklist" muestra "Sin ítems." y el input para agregar (si `canManage` o asignado).
2. Agregar un ítem con Enter → aparece en la lista, header muestra "0/1", barra de progreso en 0%.
3. Tildarlo → header pasa a "1/1", barra al 100%, texto tachado. Revisar pestaña Actividad: aparece "agregó/completó" con el label correcto.
4. Agregar 2-3 ítems más, reordenar por drag&drop → el orden persiste tras recargar la página.
5. Borrar un ítem → desaparece de la lista y el header actualiza el total.
6. Volver al tablero/lista del proyecto → la tarjeta de esa tarea muestra el chip "✓ N/M".
7. Con una cuenta asignada a la tarea pero SIN `project.manage` (rol `proyectos_colaborador` sin ese permiso, si existe una de prueba, o cualquier cuenta solo-asignada): confirmar que puede agregar/tildar/borrar ítems de esa tarea puntual.
8. Con una cuenta que NO es asignada ni tiene `project.manage` (si aplica, ej. un rol de solo lectura): confirmar que ve la checklist en solo lectura (checkboxes deshabilitados, sin input ni botón de borrar).
9. Repetir el paso 1-3 en una **subtarea** (no solo en la tarea padre).

- [ ] **Step 5: Reportar a Yesid**

No commitear nada de este Task (son solo verificaciones). Avisar que el checklist manual queda pendiente de que Yesid lo corra, y preguntar si quiere abrir PR o seguir sumando trabajo a la rama actual antes de eso.
