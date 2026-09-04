# Time Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Registro de tiempo por tarea (manual + cronómetro en vivo), sumable y atribuido por colaborador, con reportes por tarea/proyecto y un panel para la Dirección.

**Architecture:** Enfoque A: dos tablas — `work_item_time_entries` (entradas finalizadas) y `work_item_active_timers` (cronómetro corriendo, 1 por usuario). Repos en `@agency-os/db`, server actions en `apps/web/lib/time-tracking-actions.ts`, UI en el detalle de la tarea y un panel `/proyectos/tiempos`. RLS con el patrón de `023_work_item_comments`. Spec: `Docs/superpowers/specs/2026-08-21-time-tracking-design.md`.

**Tech Stack:** Next.js (App Router, server components + server actions), Supabase (Postgres + RLS), TypeScript, Tailwind, `@agency-os/{db,domain,ui}`, vitest (solo en dominio).

## Global Constraints

- Cuerpo/UI en **español**; términos técnicos en inglés donde ya son canónicos.
- BD en `snake_case`; tablas/columnas nuevas siguen `70-Database/Naming-Conventions.md`.
- Migración nueva se numera consecutiva: **027**, **028** (última actual = 026). Aplicar al remoto `hicbkpwywwhnhiawulmu` vía MCP `apply_migration`, y **reflejar el mismo SQL** en el archivo `supabase/migrations/NNN_*.sql`.
- Tras cada tarea con código: `pnpm typecheck` + `pnpm lint` verdes; dominio además `pnpm --filter @agency-os/domain test`. Los tres antes de commitear.
- **No** correr `pnpm build` con el `pnpm dev` activo (corrompe `.next`).
- Verificación visual real la hace Yesid en su Chrome admin (Playwright entra como "Creador" sin acceso a Proyectos).
- Tipos de `packages/db/src/types/database.ts` se editan **a mano** al añadir tablas (patrón usado en migraciones 024/025/026).
- Permisos existentes: `project.view` (ver/registrar), `project.manage` (editar/borrar ajeno, ver equipo). No se crean permisos nuevos.
- Repos NO filtran por organización; la guarda de org va en la server action (patrón `project-actions.ts`).

---

## File Structure

- `supabase/migrations/027_time_entries.sql` — tabla `work_item_time_entries` + índices + RLS. (Fase 1)
- `supabase/migrations/028_active_timers.sql` — tabla `work_item_active_timers` + RLS. (Fase 2)
- `packages/db/src/types/database.ts` — tipos de ambas tablas (edición manual).
- `packages/db/src/repositories/work-item-time.ts` — repos de entradas, agregados y timer.
- `packages/db/src/index.ts` — exportar el repo nuevo.
- `packages/domain/src/work-item-time.ts` + `.test.ts` — `sumMinutes`, `groupMinutesByUser` (puros, con tests).
- `packages/domain/src/index.ts` — exportar el módulo nuevo.
- `apps/web/lib/time-tracking-actions.ts` — server actions (registrar/editar/borrar, timer, reporte).
- `apps/web/components/proyectos/time-tracking-panel.tsx` — UI de tiempo en el detalle de la tarea.
- `apps/web/components/proyectos/work-item-fields-panel.tsx` — reemplaza el placeholder "Registrar el tiempo" montando el panel.
- `apps/web/app/(app)/proyectos/[cliente]/[proyecto]/tareas/[tarea]/page.tsx` — carga entradas + timer activo y los pasa al detalle.
- `apps/web/components/proyectos/project-board.tsx` — columna de tiempo en la vista Lista (Fase 3).
- `apps/web/app/(app)/proyectos/[cliente]/[proyecto]/page.tsx` — total de tiempo del proyecto (Fase 3).
- `apps/web/app/(app)/proyectos/tiempos/page.tsx` + `apps/web/components/proyectos/time-report.tsx` — panel Mis tiempos / Tiempos del equipo (Fase 3).
- `apps/web/components/proyectos/projects-sidebar.tsx` — activar los links "Mis tiempos" / "Carga del equipo" (Fase 3).

---

# FASE 1 — Modelo + registro manual + desglose en la tarea

## Task 1: Migración `work_item_time_entries` + RLS

**Files:**
- Create: `supabase/migrations/027_time_entries.sql`
- Modify (remote): aplicar vía MCP `apply_migration` a `hicbkpwywwhnhiawulmu`

**Interfaces:**
- Produces: tabla `public.work_item_time_entries(id, organization_id, work_item_id, project_id, user_id, minutes, spent_on, note, source, created_at, updated_at)`.

- [ ] **Step 1: Escribir el SQL de la migración**

```sql
-- Registro de tiempo por tarea (Fase C). Cada entrada es tiempo YA registrado
-- (manual o resultado de un cronómetro detenido), atribuido a quien lo registró
-- y sumable. project_id se denormaliza para agregar reportes sin re-join.
create table public.work_item_time_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  project_id uuid not null references public.work_items(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  minutes integer not null check (minutes > 0),
  spent_on date not null default current_date,
  note text,
  source text not null default 'manual' check (source in ('manual', 'timer')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index work_item_time_entries_work_item_idx on public.work_item_time_entries (work_item_id);
create index work_item_time_entries_project_idx on public.work_item_time_entries (project_id);
create index work_item_time_entries_user_spent_idx on public.work_item_time_entries (user_id, spent_on);

alter table public.work_item_time_entries enable row level security;

-- Ver: miembros de la org (el acceso al módulo ya exige project.view en el layout).
create policy work_item_time_entries_select on public.work_item_time_entries
  for select to authenticated
  using (organization_id in (select public.current_user_organization_ids()));

-- Registrar: solo lo tuyo, dentro de tu org.
create policy work_item_time_entries_insert on public.work_item_time_entries
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and organization_id in (select public.current_user_organization_ids())
  );

-- Editar/borrar: el dueño, o un manager de proyectos.
create policy work_item_time_entries_update on public.work_item_time_entries
  for update to authenticated
  using (
    organization_id in (select public.current_user_organization_ids())
    and (user_id = auth.uid() or public.current_user_has_permission('project.manage'))
  );
create policy work_item_time_entries_delete on public.work_item_time_entries
  for delete to authenticated
  using (
    organization_id in (select public.current_user_organization_ids())
    and (user_id = auth.uid() or public.current_user_has_permission('project.manage'))
  );
```

- [ ] **Step 2: Aplicar al remoto**

Usar MCP `apply_migration` con `project_id=hicbkpwywwhnhiawulmu`, `name=027_time_entries` y el SQL de arriba.
Expected: `{"success":true}`.

- [ ] **Step 3: Verificar la tabla**

MCP `execute_sql`: `select count(*) from public.work_item_time_entries;`
Expected: `0` sin error.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/027_time_entries.sql
git commit -m "Proyectos: migración 027 — work_item_time_entries + RLS"
```

## Task 2: Tipos generados de `work_item_time_entries`

**Files:**
- Modify: `packages/db/src/types/database.ts`

**Interfaces:**
- Produces: `Tables<"work_item_time_entries">` con `Row/Insert/Update`.

- [ ] **Step 1: Añadir el bloque de tipo**

Insertar (orden alfabético entre `work_item_comments`/`work_item_statuses`) el bloque `work_item_time_entries` con `Row`, `Insert`, `Update` y `Relationships`. Row:

```ts
      work_item_time_entries: {
        Row: {
          created_at: string
          id: string
          minutes: number
          note: string | null
          organization_id: string
          project_id: string
          source: string
          spent_on: string
          updated_at: string
          user_id: string
          work_item_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          minutes: number
          note?: string | null
          organization_id: string
          project_id: string
          source?: string
          spent_on?: string
          updated_at?: string
          user_id: string
          work_item_id: string
        }
        Update: {
          created_at?: string
          id?: string
          minutes?: number
          note?: string | null
          organization_id?: string
          project_id?: string
          source?: string
          spent_on?: string
          updated_at?: string
          user_id?: string
          work_item_id?: string
        }
        Relationships: []
      }
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: 8 tasks successful.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/types/database.ts
git commit -m "Proyectos: tipos de work_item_time_entries"
```

## Task 3: Dominio — `sumMinutes` y `groupMinutesByUser`

**Files:**
- Create: `packages/domain/src/work-item-time.ts`
- Create: `packages/domain/src/work-item-time.test.ts`
- Modify: `packages/domain/src/index.ts`

**Interfaces:**
- Produces:
  - `sumMinutes(entries: { minutes: number }[]): number`
  - `groupMinutesByUser<T extends { userId: string; minutes: number }>(entries: T[]): { userId: string; minutes: number }[]` (orden desc por minutos)

- [ ] **Step 1: Escribir el test que falla**

```ts
import { describe, expect, it } from "vitest";
import { groupMinutesByUser, sumMinutes } from "./work-item-time";

describe("sumMinutes", () => {
  it("suma los minutos de las entradas", () => {
    expect(sumMinutes([{ minutes: 30 }, { minutes: 90 }])).toBe(120);
  });
  it("es 0 sin entradas", () => {
    expect(sumMinutes([])).toBe(0);
  });
});

describe("groupMinutesByUser", () => {
  it("agrupa y suma por usuario, orden desc", () => {
    const out = groupMinutesByUser([
      { userId: "a", minutes: 30 },
      { userId: "b", minutes: 120 },
      { userId: "a", minutes: 15 },
    ]);
    expect(out).toEqual([
      { userId: "b", minutes: 120 },
      { userId: "a", minutes: 45 },
    ]);
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm --filter @agency-os/domain test`
Expected: FAIL ("Cannot find module './work-item-time'").

- [ ] **Step 3: Implementar**

```ts
// packages/domain/src/work-item-time.ts
/** Suma total de minutos de un conjunto de entradas de tiempo. */
export function sumMinutes(entries: { minutes: number }[]): number {
  return entries.reduce((total, e) => total + e.minutes, 0);
}

/** Agrupa minutos por usuario y ordena de mayor a menor. */
export function groupMinutesByUser<T extends { userId: string; minutes: number }>(
  entries: T[],
): { userId: string; minutes: number }[] {
  const byUser = new Map<string, number>();
  for (const e of entries) byUser.set(e.userId, (byUser.get(e.userId) ?? 0) + e.minutes);
  return [...byUser.entries()]
    .map(([userId, minutes]) => ({ userId, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}
```

Añadir a `packages/domain/src/index.ts`: `export * from "./work-item-time";`

- [ ] **Step 4: Correr y verificar que pasa**

Run: `pnpm --filter @agency-os/domain test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/domain/src/work-item-time.ts packages/domain/src/work-item-time.test.ts packages/domain/src/index.ts
git commit -m "Proyectos: dominio de time tracking (sumMinutes, groupMinutesByUser)"
```

## Task 4: Repo `work-item-time.ts` (entradas + agregados)

**Files:**
- Create: `packages/db/src/repositories/work-item-time.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `Db` de `./shared`, tipos de `../types/database`.
- Produces:
  - `type TimeEntryRow = Tables<"work_item_time_entries">`
  - `type TimeEntryWithUser = TimeEntryRow & { user: { id: string; full_name: string; avatar_url: string | null } | null }`
  - `insertTimeEntry(db, values: TablesInsert<"work_item_time_entries">): Promise<TimeEntryRow>`
  - `getTimeEntry(db, id): Promise<TimeEntryRow | null>`
  - `updateTimeEntry(db, id, patch: { minutes?: number; spent_on?: string; note?: string | null }): Promise<void>`
  - `deleteTimeEntry(db, id): Promise<void>`
  - `listTimeEntries(db, workItemId): Promise<TimeEntryWithUser[]>` (orden cronológico)
  - `reportEntries(db, opts: { organizationId: string; userId?: string; projectId?: string; from?: string; to?: string }): Promise<TimeEntryWithUser[]>`

- [ ] **Step 1: Implementar el repo**

```ts
import type { Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type TimeEntryRow = Tables<"work_item_time_entries">;
export type TimeEntryWithUser = TimeEntryRow & {
  user: { id: string; full_name: string; avatar_url: string | null } | null;
};

const SELECT_WITH_USER =
  "*, user:users!work_item_time_entries_user_id_fkey(id, person:people(full_name, avatar_url))";

type SelectRow = TimeEntryRow & {
  user: { id: string; person: { full_name: string; avatar_url: string | null } | null } | null;
};

function toEntry(row: SelectRow): TimeEntryWithUser {
  return {
    ...row,
    user: row.user
      ? {
          id: row.user.id,
          full_name: row.user.person?.full_name ?? "—",
          avatar_url: row.user.person?.avatar_url ?? null,
        }
      : null,
  };
}

export async function insertTimeEntry(
  db: Db,
  values: TablesInsert<"work_item_time_entries">,
): Promise<TimeEntryRow> {
  const { data, error } = await db.from("work_item_time_entries").insert(values).select("*").single();
  if (error) throw error;
  return data;
}

export async function getTimeEntry(db: Db, id: string): Promise<TimeEntryRow | null> {
  const { data, error } = await db.from("work_item_time_entries").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function updateTimeEntry(
  db: Db,
  id: string,
  patch: { minutes?: number; spent_on?: string; note?: string | null },
): Promise<void> {
  const { error } = await db
    .from("work_item_time_entries")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteTimeEntry(db: Db, id: string): Promise<void> {
  const { error } = await db.from("work_item_time_entries").delete().eq("id", id);
  if (error) throw error;
}

export async function listTimeEntries(db: Db, workItemId: string): Promise<TimeEntryWithUser[]> {
  const { data, error } = await db
    .from("work_item_time_entries")
    .select(SELECT_WITH_USER)
    .eq("work_item_id", workItemId)
    .order("spent_on", { ascending: true })
    .order("created_at", { ascending: true })
    .returns<SelectRow[]>();
  if (error) throw error;
  return (data ?? []).map(toEntry);
}

export async function reportEntries(
  db: Db,
  opts: { organizationId: string; userId?: string; projectId?: string; from?: string; to?: string },
): Promise<TimeEntryWithUser[]> {
  let q = db
    .from("work_item_time_entries")
    .select(SELECT_WITH_USER)
    .eq("organization_id", opts.organizationId);
  if (opts.userId) q = q.eq("user_id", opts.userId);
  if (opts.projectId) q = q.eq("project_id", opts.projectId);
  if (opts.from) q = q.gte("spent_on", opts.from);
  if (opts.to) q = q.lte("spent_on", opts.to);
  const { data, error } = await q.order("spent_on", { ascending: false }).returns<SelectRow[]>();
  if (error) throw error;
  return (data ?? []).map(toEntry);
}
```

Añadir a `packages/db/src/index.ts`: `export * from "./repositories/work-item-time";`

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes.

- [ ] **Step 3: Verificar el embed de FK contra REST**

MCP `execute_sql`: `select constraint_name from information_schema.table_constraints where table_name = 'work_item_time_entries' and constraint_type = 'FOREIGN KEY';`
Expected: incluye `work_item_time_entries_user_id_fkey` (nombre usado en `SELECT_WITH_USER`). Si difiere, ajustar el alias del embed.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/repositories/work-item-time.ts packages/db/src/index.ts
git commit -m "Proyectos: repo work-item-time (entradas + reporte)"
```

## Task 5: Server actions de registro manual

**Files:**
- Create: `apps/web/lib/time-tracking-actions.ts`

**Interfaces:**
- Consumes: `getCurrentUser`, `hasPermission` de `@/lib/auth`; `getSupabaseServerClient`; repos de Task 4; `recordActivity` de `@agency-os/db`; `parseDuration` de `@agency-os/domain`.
- Produces (Fase 1):
  - `addTimeEntry(input: { workItemId: string; minutes: number; spentOn: string; note?: string | null }): Promise<{ id: string } | { error: string }>`
  - `editTimeEntry(input: { id: string; minutes: number; spentOn: string; note?: string | null }): Promise<{ ok: true } | { error: string }>`
  - `deleteTimeEntryAction(id: string): Promise<{ ok: true } | { error: string }>`
  - `type TimeEntryDTO = { id: string; userId: string; userName: string; userAvatarUrl: string | null; minutes: number; spentOn: string; note: string | null; source: string }`
  - helper `assertWorkItemInOrg` (reusar el de `project-actions.ts` si es exportable; si no, replicar la consulta: `work_items` by id, comparar `organization_id`, devolver `project_id`).

- [ ] **Step 1: Implementar las actions de Fase 1**

```ts
"use server";

import { revalidatePath } from "next/cache";
import {
  deleteTimeEntry,
  getTimeEntry,
  insertTimeEntry,
  recordActivity,
  updateTimeEntry,
} from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { Db } from "@agency-os/db";

export type ActionResult = { ok: true; error?: never } | { ok?: never; error: string };
export type IdResult = { id: string; error?: never } | { id?: never; error: string };

/** Confirma que el work item existe y es de la org; devuelve su project_id. */
async function workItemProjectId(
  db: Db,
  workItemId: string,
  organizationId: string,
): Promise<string | null> {
  const { data } = await db
    .from("work_items")
    .select("project_id, organization_id")
    .eq("id", workItemId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data || data.organization_id !== organizationId) return null;
  return data.project_id;
}

export async function addTimeEntry(input: {
  workItemId: string;
  minutes: number;
  spentOn: string;
  note?: string | null;
}): Promise<IdResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "project.view")) return { error: "No tienes permiso." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  if (!Number.isFinite(input.minutes) || input.minutes <= 0) {
    return { error: "La duración debe ser mayor a cero." };
  }
  try {
    const db = await getSupabaseServerClient();
    const projectId = await workItemProjectId(db, input.workItemId, organizationId);
    if (!projectId) return { error: "La tarea no existe o no pertenece a tu organización." };
    const row = await insertTimeEntry(db, {
      organization_id: organizationId,
      work_item_id: input.workItemId,
      project_id: projectId,
      user_id: user.id,
      minutes: Math.round(input.minutes),
      spent_on: input.spentOn,
      note: input.note?.trim() || null,
      source: "manual",
    });
    try {
      await recordActivity(db, {
        orgId: organizationId,
        workItemId: input.workItemId,
        actorUserId: user.id,
        eventType: "time_logged",
        payload: { minutes: Math.round(input.minutes), source: "manual" },
      });
    } catch (e) {
      console.error("addTimeEntry:activity", e);
    }
    revalidatePath("/proyectos");
    return { id: row.id };
  } catch (error) {
    console.error("addTimeEntry", error);
    return { error: "No se pudo registrar el tiempo. Intenta de nuevo." };
  }
}

export async function editTimeEntry(input: {
  id: string;
  minutes: number;
  spentOn: string;
  note?: string | null;
}): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  if (!Number.isFinite(input.minutes) || input.minutes <= 0) {
    return { error: "La duración debe ser mayor a cero." };
  }
  try {
    const db = await getSupabaseServerClient();
    const entry = await getTimeEntry(db, input.id);
    if (!entry || entry.organization_id !== organizationId) {
      return { error: "La entrada no existe o no pertenece a tu organización." };
    }
    if (entry.user_id !== user.id && !hasPermission(user, "project.manage")) {
      return { error: "Solo puedes editar tus propias entradas." };
    }
    await updateTimeEntry(db, input.id, {
      minutes: Math.round(input.minutes),
      spent_on: input.spentOn,
      note: input.note?.trim() || null,
    });
    revalidatePath("/proyectos");
    return { ok: true };
  } catch (error) {
    console.error("editTimeEntry", error);
    return { error: "No se pudo editar la entrada. Intenta de nuevo." };
  }
}

export async function deleteTimeEntryAction(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  try {
    const db = await getSupabaseServerClient();
    const entry = await getTimeEntry(db, id);
    if (!entry || entry.organization_id !== organizationId) {
      return { error: "La entrada no existe o no pertenece a tu organización." };
    }
    if (entry.user_id !== user.id && !hasPermission(user, "project.manage")) {
      return { error: "Solo puedes borrar tus propias entradas." };
    }
    await deleteTimeEntry(db, id);
    revalidatePath("/proyectos");
    return { ok: true };
  } catch (error) {
    console.error("deleteTimeEntryAction", error);
    return { error: "No se pudo borrar la entrada. Intenta de nuevo." };
  }
}
```

Nota: el `eventType: "time_logged"` debe añadirse al render de actividad en `work-item-activity-panel.tsx` (`activityText`) en la Task 7.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes. (Confirmar la firma real de `recordActivity` en `packages/db/src/repositories/work-item-activity.ts` y ajustar los nombres de parámetros si difieren de `{orgId, workItemId, actorUserId, eventType, payload}`.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/time-tracking-actions.ts
git commit -m "Proyectos: server actions de registro de tiempo (manual)"
```

## Task 6: UI — panel de tiempo en el detalle (registro manual + desglose)

**Files:**
- Create: `apps/web/components/proyectos/time-tracking-panel.tsx`
- Modify: `apps/web/components/proyectos/work-item-fields-panel.tsx` (reemplazar el placeholder "Registrar el tiempo")
- Modify: `apps/web/app/(app)/proyectos/[cliente]/[proyecto]/tareas/[tarea]/page.tsx` (cargar entradas y pasarlas)

**Interfaces:**
- Consumes: `addTimeEntry`, `editTimeEntry`, `deleteTimeEntryAction`, `TimeEntryDTO` (Task 5); `formatDuration`, `parseDuration`, `sumMinutes`, `groupMinutesByUser`, `initialsOf` de `@agency-os/domain`; `Avatar`, `Button`, `Input` de `@agency-os/ui`.
- Produces: `<TimeTrackingPanel workItemId currentUserId canManage entries orgUsers />` donde `entries: TimeEntryDTO[]`, `orgUsers: { id: string; name: string; avatarUrl: string | null }[]`.

- [ ] **Step 1: Página — cargar entradas y mapear a DTO**

En `tareas/[tarea]/page.tsx`, junto a comentarios/actividad, añadir:

```ts
import { listTimeEntries } from "@agency-os/db";
// ...
const timeEntryRows = await listTimeEntries(db, taskId);
const timeEntries = timeEntryRows.map((e) => ({
  id: e.id,
  userId: e.user_id,
  userName: e.user?.full_name ?? "—",
  userAvatarUrl: e.user?.avatar_url ?? null,
  minutes: e.minutes,
  spentOn: e.spent_on,
  note: e.note,
  source: e.source,
}));
```

Pasar `timeEntries` al `<WorkItemDetail>` (nuevo prop) → que lo reenvíe a `WorkItemFieldsPanel`. (Añadir el prop en las interfaces de `work-item-detail.tsx` y `work-item-fields-panel.tsx`.)

- [ ] **Step 2: Implementar `TimeTrackingPanel`**

Componente cliente con: total (`formatDuration(sumMinutes(entries))`); desglose por colaborador (`groupMinutesByUser`, con `Avatar` + nombre + `formatDuration`); form manual (input de duración con `parseDuration`, input `date` default hoy, textarea nota opcional, botón Agregar → `addTimeEntry` + `router.refresh()`); cada entrada propia editable/borrable (o cualquiera si `canManage`) con `editTimeEntry`/`deleteTimeEntryAction`. Errores inline con `text-danger`. Estilos glass coherentes con el resto (`bg-glass`, filas compactas). Placeholder de duración termina en `…`.

- [ ] **Step 3: Montar en `work-item-fields-panel.tsx`**

Reemplazar el bloque placeholder:

```tsx
<Row icon={<IconTimer />} label="Registrar el tiempo">
  <span className="text-sm text-faint">Vacío</span>
</Row>
```

por el total + botón que despliega el panel (o montar `<TimeTrackingPanel .../>` como sección propia bajo el grid de campos, según encaje visual). La fila muestra `formatDuration(totalMinutes)` cuando hay tiempo.

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/proyectos/time-tracking-panel.tsx apps/web/components/proyectos/work-item-fields-panel.tsx apps/web/components/proyectos/work-item-detail.tsx "apps/web/app/(app)/proyectos/[cliente]/[proyecto]/tareas/[tarea]/page.tsx"
git commit -m "Proyectos: registro manual de tiempo + desglose por colaborador en la tarea"
```

## Task 7: Evento de actividad `time_logged`

**Files:**
- Modify: `apps/web/components/proyectos/work-item-activity-panel.tsx` (`activityText`)

- [ ] **Step 1: Añadir el caso al switch de `activityText`**

```ts
case "time_logged": {
  const mins = Number(p.minutes ?? 0);
  return mins > 0 ? `registró ${formatDuration(mins)}` : "registró tiempo";
}
```

Importar `formatDuration` de `@agency-os/domain` en el archivo si no está.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/proyectos/work-item-activity-panel.tsx
git commit -m "Proyectos: evento de actividad 'registró tiempo'"
```

## Task 8: Checkpoint de verificación — Fase 1

- [ ] **Step 1: Verificación de datos (MCP)**

Insertar una entrada de prueba con `execute_sql` (o vía la UI en el navegador de Yesid) y confirmar `select work_item_id, user_id, minutes, source from work_item_time_entries;` devuelve la fila.

- [ ] **Step 2: Checklist para Yesid (Chrome admin)**

- En una tarea: registrar 2h manual → el total sube a "2h", aparece en el desglose atribuido a él.
- Registrar otra entrada (otro día) → el total suma.
- Editar y borrar la propia entrada; verificar que otro usuario no puede (probar con otra cuenta si aplica).
- En Actividad aparece "registró 2h".
- Claro + oscuro; fondos glass.

---

# FASE 2 — Cronómetro en vivo

## Task 9: Migración `work_item_active_timers` + RLS

**Files:**
- Create: `supabase/migrations/028_active_timers.sql`
- Modify (remote): aplicar vía MCP

**Interfaces:**
- Produces: tabla `public.work_item_active_timers(user_id PK, organization_id, work_item_id, started_at)`.

- [ ] **Step 1: SQL**

```sql
-- Cronómetro en curso: un solo timer activo por usuario (PK user_id). Al detener,
-- la server action calcula minutos e inserta una entrada en work_item_time_entries.
create table public.work_item_active_timers (
  user_id uuid primary key references public.users(id) on delete cascade,
  organization_id uuid not null references public.organizations(id),
  work_item_id uuid not null references public.work_items(id) on delete cascade,
  started_at timestamptz not null default now()
);

alter table public.work_item_active_timers enable row level security;

-- Cada quien ve/gestiona SOLO su propio timer.
create policy work_item_active_timers_select on public.work_item_active_timers
  for select to authenticated using (user_id = auth.uid());
create policy work_item_active_timers_insert on public.work_item_active_timers
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and organization_id in (select public.current_user_organization_ids())
  );
create policy work_item_active_timers_update on public.work_item_active_timers
  for update to authenticated using (user_id = auth.uid());
create policy work_item_active_timers_delete on public.work_item_active_timers
  for delete to authenticated using (user_id = auth.uid());
```

- [ ] **Step 2: Aplicar (MCP `apply_migration`, name `028_active_timers`) y verificar** `select count(*) from work_item_active_timers;` → 0.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/028_active_timers.sql
git commit -m "Proyectos: migración 028 — work_item_active_timers + RLS"
```

## Task 10: Tipos + repo del timer

**Files:**
- Modify: `packages/db/src/types/database.ts` (bloque `work_item_active_timers`)
- Modify: `packages/db/src/repositories/work-item-time.ts`

**Interfaces:**
- Produces:
  - `type ActiveTimerRow = Tables<"work_item_active_timers">`
  - `getActiveTimer(db, userId): Promise<ActiveTimerRow | null>`
  - `upsertActiveTimer(db, values: { user_id: string; organization_id: string; work_item_id: string }): Promise<ActiveTimerRow>` (onConflict `user_id`, resetea `started_at`)
  - `deleteActiveTimer(db, userId): Promise<void>`

- [ ] **Step 1: Añadir tipos** de `work_item_active_timers` (Row/Insert/Update, Relationships `[]`) al database.ts (misma mecánica que Task 2).

- [ ] **Step 2: Añadir funciones al repo**

```ts
export type ActiveTimerRow = Tables<"work_item_active_timers">;

export async function getActiveTimer(db: Db, userId: string): Promise<ActiveTimerRow | null> {
  const { data, error } = await db
    .from("work_item_active_timers")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertActiveTimer(
  db: Db,
  values: { user_id: string; organization_id: string; work_item_id: string },
): Promise<ActiveTimerRow> {
  const { data, error } = await db
    .from("work_item_active_timers")
    .upsert({ ...values, started_at: new Date().toISOString() }, { onConflict: "user_id" })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function deleteActiveTimer(db: Db, userId: string): Promise<void> {
  const { error } = await db.from("work_item_active_timers").delete().eq("user_id", userId);
  if (error) throw error;
}
```

- [ ] **Step 3: Typecheck + lint** → verdes.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/types/database.ts packages/db/src/repositories/work-item-time.ts
git commit -m "Proyectos: repo y tipos del cronómetro activo"
```

## Task 11: Server actions del cronómetro

**Files:**
- Modify: `apps/web/lib/time-tracking-actions.ts`

**Interfaces:**
- Consumes: `getActiveTimer`, `upsertActiveTimer`, `deleteActiveTimer`, `insertTimeEntry`, `recordActivity`.
- Produces:
  - `startTimer(workItemId: string): Promise<ActionResult>` — si hay uno activo, lo detiene (crea su entrada) y arranca el nuevo.
  - `stopTimer(): Promise<{ minutes: number } | { error: string }>` — calcula minutos desde `started_at`, crea entrada `source='timer'` (si ≥1 min), borra el timer, registra actividad.
  - `getActiveTimerAction(): Promise<{ workItemId: string; startedAt: string } | null>` — para hidratar la UI.

- [ ] **Step 1: Implementar**

```ts
// helper interno: detiene el timer activo (si existe) creando su entrada.
async function stopActiveTimer(db, user, organizationId): Promise<void> {
  const active = await getActiveTimer(db, user.id);
  if (!active) return;
  const minutes = Math.round((Date.now() - new Date(active.started_at).getTime()) / 60000);
  const projectId = await workItemProjectId(db, active.work_item_id, organizationId);
  if (minutes >= 1 && projectId) {
    await insertTimeEntry(db, {
      organization_id: organizationId,
      work_item_id: active.work_item_id,
      project_id: projectId,
      user_id: user.id,
      minutes,
      spent_on: new Date().toISOString().slice(0, 10),
      source: "timer",
    });
    try {
      await recordActivity(db, {
        orgId: organizationId, workItemId: active.work_item_id, actorUserId: user.id,
        eventType: "time_logged", payload: { minutes, source: "timer" },
      });
    } catch (e) { console.error("stopActiveTimer:activity", e); }
  }
  await deleteActiveTimer(db, user.id);
}
```

`startTimer`: auth `project.view` → `stopActiveTimer` (auto-stop del previo) → `upsertActiveTimer({user_id, organization_id, work_item_id})` → `revalidatePath("/proyectos")` → `{ok:true}`.
`stopTimer`: auth → `stopActiveTimer` devolviendo minutos (refactor: que `stopActiveTimer` retorne los minutos) → `{minutes}`; si no había timer, `{minutes:0}`.
`getActiveTimerAction`: devuelve `{workItemId, startedAt}` o null.

- [ ] **Step 2: Typecheck + lint** → verdes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/time-tracking-actions.ts
git commit -m "Proyectos: server actions del cronómetro (start/stop, auto-stop)"
```

## Task 12: UI del cronómetro en el panel

**Files:**
- Modify: `apps/web/components/proyectos/time-tracking-panel.tsx`
- Modify: `apps/web/app/(app)/proyectos/[cliente]/[proyecto]/tareas/[tarea]/page.tsx` (pasar `activeTimer`)

**Interfaces:**
- Consumes: `startTimer`, `stopTimer`, `getActiveTimerAction`.
- Produces: prop `activeTimer?: { workItemId: string; startedAt: string } | null` en `TimeTrackingPanel`.

- [ ] **Step 1: Página** — cargar `getActiveTimerAction()` y pasarlo al panel.
- [ ] **Step 2: UI** — botón ▷ Iniciar (si no hay timer en esta tarea) / ⏹ Detener (si el activo es esta tarea) con contador en vivo (setInterval desde `startedAt`, formateado mm:ss/h). Si hay un timer activo en OTRA tarea, mostrar aviso "Tienes un cronómetro en otra tarea" y que Iniciar lo mueva (auto-stop). Tras start/stop → `router.refresh()`. Honrar `prefers-reduced-motion` (el contador es texto, sin animación CSS).
- [ ] **Step 3: Typecheck + lint** → verdes.
- [ ] **Step 4: Commit**

```bash
git add apps/web/components/proyectos/time-tracking-panel.tsx "apps/web/app/(app)/proyectos/[cliente]/[proyecto]/tareas/[tarea]/page.tsx"
git commit -m "Proyectos: cronómetro en vivo en la tarea (iniciar/detener)"
```

## Task 13: Checkpoint Fase 2 (Yesid)

- [ ] Iniciar cronómetro en una tarea → contador corre; detener → crea entrada `timer` que suma al total y aparece en actividad.
- [ ] Iniciar en otra tarea con uno corriendo → el primero se detiene solo y crea su entrada.
- [ ] Refrescar con timer corriendo → la UI lo rehidrata (sigue mostrando el timer activo).

---

# FASE 3 — Reportes

## Task 14: Total de tiempo del proyecto + columna en Lista

**Files:**
- Modify: `packages/db/src/repositories/work-item-time.ts` (agregados de proyecto)
- Modify: `apps/web/app/(app)/proyectos/[cliente]/[proyecto]/page.tsx`
- Modify: `apps/web/components/proyectos/project-board.tsx` (columna de tiempo en `ListView`)

**Interfaces:**
- Produces:
  - `sumMinutesByProject(db, projectId): Promise<number>`
  - `sumMinutesByTask(db, projectId): Promise<Record<string, number>>` (minutos por `work_item_id`)

- [ ] **Step 1: Repos de agregado**

```ts
export async function sumMinutesByTask(db: Db, projectId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  const { data, error } = await db
    .from("work_item_time_entries")
    .select("work_item_id, minutes")
    .eq("project_id", projectId);
  if (error) throw error;
  for (const r of data ?? []) out[r.work_item_id] = (out[r.work_item_id] ?? 0) + r.minutes;
  return out;
}

export async function sumMinutesByProject(db: Db, projectId: string): Promise<number> {
  const { data, error } = await db
    .from("work_item_time_entries")
    .select("minutes")
    .eq("project_id", projectId);
  if (error) throw error;
  return (data ?? []).reduce((n, r) => n + r.minutes, 0);
}
```

- [ ] **Step 2: Página del proyecto** — cargar `sumMinutesByProject` y `sumMinutesByTask`, pasar el total a la cabecera (junto al estado del proyecto) y el mapa por tarea al board para la Lista.
- [ ] **Step 3: Lista** — mostrar `formatDuration(minutesByTask[t.id] ?? 0)` como columna/chip en cada fila (tablero opcional). Números tabulares (`tabular-nums`).
- [ ] **Step 4: Typecheck + lint** → verdes.
- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repositories/work-item-time.ts "apps/web/app/(app)/proyectos/[cliente]/[proyecto]/page.tsx" apps/web/components/proyectos/project-board.tsx
git commit -m "Proyectos: tiempo total del proyecto + columna de tiempo en la Lista"
```

## Task 15: Panel `/proyectos/tiempos` (Mis tiempos / Tiempos del equipo)

**Files:**
- Create: `apps/web/app/(app)/proyectos/tiempos/page.tsx`
- Create: `apps/web/components/proyectos/time-report.tsx`
- Modify: `apps/web/components/proyectos/projects-sidebar.tsx` (activar links del footer)

**Interfaces:**
- Consumes: `reportEntries` (Task 4), `groupMinutesByUser`, `formatDuration`; `getCurrentUser`, `hasPermission`.
- Produces: ruta server-rendered con filtros por `searchParams` (`from`, `to`, `project`, `scope`).

- [ ] **Step 1: Página** — server component bajo el layout de Proyectos (hereda el gate de acceso). Determina `canManage = hasPermission(user, "project.manage")`. `scope` = `mine` (default) o `team` (solo si canManage). Llama `reportEntries({ organizationId, userId: scope==='mine' ? user.id : undefined, projectId, from, to })`.
- [ ] **Step 2: `TimeReport`** — presentacional: tabla/tiles con totales por colaborador (`groupMinutesByUser` sobre `{userId, minutes}` de las entradas), y lista de entradas (fecha, tarea, persona, duración, nota). Filtros: rango de fechas (inputs `date`) y selector de proyecto; toggle Mis tiempos / Tiempos del equipo (este último solo si canManage). Estado vacío claro. `tabular-nums` en las cifras. Cards glass.
- [ ] **Step 3: Sidebar** — convertir los `SidebarPlaceholder` "Mis tiempos" y "Carga del equipo" en enlaces: "Mis tiempos" → `/proyectos/tiempos`; "Tiempos del equipo" → `/proyectos/tiempos?scope=team` (solo si `canManage`, prop nuevo al sidebar desde el layout). Quitar el badge "pronto" de estos dos.
- [ ] **Step 4: Typecheck + lint** → verdes.
- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(app)/proyectos/tiempos/page.tsx" apps/web/components/proyectos/time-report.tsx apps/web/components/proyectos/projects-sidebar.tsx "apps/web/app/(app)/proyectos/layout.tsx"
git commit -m "Proyectos: panel de tiempos (Mis tiempos / Tiempos del equipo)"
```

## Task 16: Checkpoint Fase 3 + memoria

- [ ] Yesid (Chrome admin): total del proyecto correcto (= suma de tareas); columna de tiempo en Lista; `/proyectos/tiempos` muestra Mis tiempos; como admin, Tiempos del equipo con totales por colaborador y filtros de proyecto/fecha.
- [ ] Actualizar la memoria `proyectos-clickup-parity-faseb` con el estado de time tracking.

---

## Self-Review (autor del plan)

- **Cobertura de la spec:** registro manual (T5/T6) ✓, cronómetro + auto-stop (T9–T12) ✓, atribución por usuario (esquema + actions) ✓, permisos dueño/manager (RLS T1 + actions T5) ✓, desglose por colaborador en tarea (T6) ✓, total proyecto + por tarea (T14) ✓, panel Director Mis/Equipo con filtros (T15) ✓, evento de actividad (T7) ✓, fases 1/2/3 ✓. Fuera de alcance (facturación, aprobación, capacidad) no se implementa ✓.
- **Placeholders:** SQL, tipos, repos, actions y firmas concretos; los pasos de UI describen comportamiento + archivos exactos (la implementación fina del componente se detalla en su tarea, no en pseudo-código, por ser JSX extenso — aceptable dado el patrón del repo).
- **Consistencia de tipos:** `insertTimeEntry`/`getTimeEntry`/`updateTimeEntry`/`deleteTimeEntry`/`listTimeEntries`/`reportEntries`/`sumMinutesByTask`/`sumMinutesByProject`/`getActiveTimer`/`upsertActiveTimer`/`deleteActiveTimer` usados igual en repos y actions. `time_logged` producido en actions (T5/T11) y consumido en `activityText` (T7). Verificar en T5 la firma real de `recordActivity` antes de usarla.
