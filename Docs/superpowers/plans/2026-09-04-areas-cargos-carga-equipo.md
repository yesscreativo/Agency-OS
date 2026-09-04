# Áreas, Cargos y "Carga del equipo" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modelar Áreas (con un gerente) y Cargos (etiqueta, por área), administrables desde `/usuarios` (super admin) y desde una página nueva `/mi-area` (el gerente de cada área), que además muestra "Carga del equipo" (tareas abiertas + tiempo de la semana por colaborador).

**Architecture:** Dos tablas nuevas (`areas`, `job_titles`) + 2 columnas en `people`. RLS por dueño (`manager_user_id = auth.uid()`) para `job_titles` y para una policy nueva de `people` — sin tocar las policies de `people` ya existentes. Fase 1: modelo + administración en `/usuarios` (super admin, vía `access-actions.ts` + `service_role` para tocar `people.area_id`, mismo patrón que `inviteUser`/`deleteUser`). Fase 2: página `/mi-area` con su propio archivo de actions (`mi-area-actions.ts`), gateada por "sos el gerente de esta área" o super admin. Spec: `Docs/superpowers/specs/2026-09-04-areas-cargos-carga-equipo-design.md`.

**Tech Stack:** Next.js (App Router, server components + server actions), Supabase (Postgres + RLS), TypeScript, `@agency-os/{db,domain,ui}`, vitest (dominio).

## Global Constraints

- Cuerpo/UI en **español**; BD en `snake_case`.
- Migración nueva se numera **034** (última actual = 033). Aplicar al remoto `hicbkpwywwhnhiawulmu` vía MCP `apply_migration`, y reflejar el mismo SQL en `supabase/migrations/034_*.sql`.
- Tras cada tarea con código: `pnpm typecheck && pnpm lint` verdes; la de dominio además `pnpm --filter @agency-os/domain test`.
- No correr `pnpm build` con `pnpm dev` activo.
- **No commitear hasta que Yesid lo pida explícitamente.**
- Un cargo NO otorga permisos. Una persona pertenece a una sola área. No se borran áreas/cargos en este trabajo.

---

## File Structure

- `supabase/migrations/034_areas_job_titles.sql` — tablas + columnas + RLS.
- `packages/db/src/repositories/areas.ts` (nuevo) — `listAreas`, `createArea`, `updateAreaManager`, `listAreasManagedBy`, `getArea`, `listPeopleInArea`.
- `packages/db/src/repositories/job-titles.ts` (nuevo) — `listJobTitles`, `createJobTitle`, `renameJobTitle`.
- `packages/db/src/repositories/people.ts` (ampliar) — `assignPersonJobTitle`.
- `packages/db/src/repositories/users.ts` (ampliar) — `listOrgUsers` trae área.
- `packages/db/src/repositories/work-items.ts` (ampliar) — `countOpenTasksByAssignee`.
- `packages/db/src/repositories/work-item-time.ts` (ampliar) — `sumMinutesByUsersInRange`.
- `packages/domain/src/format.ts` (ampliar) — `currentWeekRange` + test.
- `apps/web/lib/access-actions.ts` (ampliar) — `createAreaAction`, `updateAreaManagerAction`, `assignPersonAreaAction`.
- `apps/web/lib/mi-area-actions.ts` (nuevo) — `createJobTitleAction`, `renameJobTitleAction`, `assignPersonJobTitleAction`.
- `apps/web/components/access/areas-manager.tsx` (nuevo) — Fase 1, catálogo de áreas + crear/cambiar gerente.
- `apps/web/components/access/access-manager.tsx` (ampliar) — columna Área + asignar.
- `apps/web/app/(app)/(hub)/usuarios/page.tsx` (ampliar) — carga áreas + las pasa.
- `apps/web/app/(app)/(hub)/mi-area/page.tsx` (nuevo) — Fase 2.
- `apps/web/components/mi-area/job-titles-manager.tsx`, `apps/web/components/mi-area/area-collaborators.tsx`, `apps/web/components/mi-area/team-workload-cards.tsx` (nuevos).
- `apps/web/components/hub-icons.tsx` (ampliar) — `AreaIcon`.
- `apps/web/app/(app)/(hub)/layout.tsx` (ampliar) — link "Mi área" condicional.

---

# FASE 1 — Modelo de datos + administración (super admin)

## Task 1: Migración — `areas`, `job_titles`, columnas en `people`

**Files:**
- Create: `supabase/migrations/034_areas_job_titles.sql`

**Interfaces:**
- Produces: tablas `public.areas(id, organization_id, name, manager_user_id, created_at, updated_at)`, `public.job_titles(id, organization_id, area_id, name, created_at, updated_at)`; columnas `public.people.area_id`, `public.people.job_title_id`.

- [ ] **Step 1: Escribir el SQL**

```sql
-- Estructura organizacional: un Área tiene un gerente (manager_user_id); sus
-- colaboradores (people.area_id) reportan a él automáticamente — no hay campo
-- "reporta a" independiente. Un Cargo (job_title) es solo una etiqueta
-- (RRHH/organigrama, sin permisos) y siempre pertenece a un Área. Base para
-- "Carga del equipo" y, más adelante, el módulo de vacaciones de RRHH. Ver
-- Docs/superpowers/specs/2026-09-04-areas-cargos-carga-equipo-design.md.

create table public.areas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  manager_user_id uuid references public.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.job_titles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  area_id uuid not null references public.areas(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.people add column area_id uuid references public.areas(id);
alter table public.people add column job_title_id uuid references public.job_titles(id);

alter table public.areas enable row level security;
alter table public.job_titles enable row level security;

create policy areas_select on public.areas
  for select to authenticated
  using (organization_id in (select public.current_user_organization_ids()));
create policy areas_write on public.areas
  for all to authenticated
  using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_is_super()
  );

create policy job_titles_select on public.job_titles
  for select to authenticated
  using (organization_id in (select public.current_user_organization_ids()));
create policy job_titles_write on public.job_titles
  for all to authenticated
  using (
    organization_id in (select public.current_user_organization_ids())
    and (
      public.current_user_is_super()
      or exists (
        select 1 from public.areas a
        where a.id = job_titles.area_id and a.manager_user_id = auth.uid()
      )
    )
  );

-- El gerente de un área puede tocar (solo) el cargo de las personas de su
-- área — la server action correspondiente solo manda `job_title_id` en el
-- UPDATE (RLS no filtra por columna). Asignar el ÁREA de una persona sigue
-- siendo solo de super admin, vía service_role (mismo patrón que
-- inviteUser/deleteUser en access-actions.ts) — no necesita policy nueva.
create policy people_manager_update on public.people
  for update to authenticated
  using (
    exists (
      select 1 from public.areas a
      where a.id = people.area_id and a.manager_user_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Aplicar al remoto**

MCP `apply_migration`, `project_id=hicbkpwywwhnhiawulmu`, `name=034_areas_job_titles`.
Expected: `{"success":true}`.

- [ ] **Step 3: Verificar**

MCP `execute_sql`: `select count(*) from public.areas; select count(*) from public.job_titles;`
Expected: `0` en ambas, sin error.

- [ ] **Step 4: Verificar que NO se rompió la recursión de `people` (regresión)**

MCP `execute_sql`, simulando el JWT de un usuario real (mismo patrón que la migración 028 de esta sesión): `update public.people set full_name = full_name where id = '<tu person_id>';` dentro de una transacción con `rollback` al final.
Expected: sin error `42P17`.

- [ ] **Step 5: Commit**

(Solo cuando Yesid lo pida.)

## Task 2: Repo `areas.ts`

**Files:**
- Create: `packages/db/src/repositories/areas.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Produces:
  - `type AreaRow = Tables<"areas">`
  - `listAreas(db, orgId): Promise<(AreaRow & { managerName: string | null })[]>`
  - `createArea(db, { organizationId, name, managerUserId }): Promise<AreaRow>`
  - `updateAreaManager(db, id, managerUserId): Promise<void>`
  - `listAreasManagedBy(db, userId): Promise<AreaRow[]>`
  - `getArea(db, id): Promise<AreaRow | null>`
  - `type AreaPerson = { id: string; fullName: string; jobTitleId: string | null; jobTitleName: string | null }`
  - `listPeopleInArea(db, areaId): Promise<AreaPerson[]>`

- [ ] **Step 1: Implementar**

```ts
import type { Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type AreaRow = Tables<"areas">;

type AreaSelectRow = AreaRow & {
  manager: { id: string; person: { full_name: string } | null } | null;
};

const AREA_SELECT = "*, manager:users!areas_manager_user_id_fkey(id, person:people(full_name))";

export async function listAreas(
  db: Db,
  orgId: string,
): Promise<(AreaRow & { managerName: string | null })[]> {
  const { data, error } = await db
    .from("areas")
    .select(AREA_SELECT)
    .eq("organization_id", orgId)
    .order("name")
    .returns<AreaSelectRow[]>();
  if (error) throw error;
  return (data ?? []).map((row) => ({
    ...row,
    managerName: row.manager?.person?.full_name ?? null,
  }));
}

export async function createArea(
  db: Db,
  values: { organizationId: string; name: string; managerUserId: string },
): Promise<AreaRow> {
  const insert: TablesInsert<"areas"> = {
    organization_id: values.organizationId,
    name: values.name,
    manager_user_id: values.managerUserId,
  };
  const { data, error } = await db.from("areas").insert(insert).select("*").single();
  if (error) throw error;
  return data;
}

export async function updateAreaManager(db: Db, id: string, managerUserId: string): Promise<void> {
  const { error } = await db
    .from("areas")
    .update({ manager_user_id: managerUserId, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function listAreasManagedBy(db: Db, userId: string): Promise<AreaRow[]> {
  const { data, error } = await db.from("areas").select("*").eq("manager_user_id", userId).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function getArea(db: Db, id: string): Promise<AreaRow | null> {
  const { data, error } = await db.from("areas").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export interface AreaPerson {
  id: string;
  fullName: string;
  jobTitleId: string | null;
  jobTitleName: string | null;
}

type AreaPersonRow = {
  id: string;
  full_name: string;
  job_title_id: string | null;
  job_title: { id: string; name: string } | null;
};

export async function listPeopleInArea(db: Db, areaId: string): Promise<AreaPerson[]> {
  const { data, error } = await db
    .from("people")
    .select("id, full_name, job_title_id, job_title:job_titles(id, name)")
    .eq("area_id", areaId)
    .is("deleted_at", null)
    .order("full_name")
    .returns<AreaPersonRow[]>();
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id,
    fullName: r.full_name,
    jobTitleId: r.job_title_id,
    jobTitleName: r.job_title?.name ?? null,
  }));
}
```

- [ ] **Step 2: Verificar el nombre de la FK del embed**

MCP `execute_sql`: `select constraint_name from information_schema.table_constraints where table_name = 'areas' and constraint_type = 'FOREIGN KEY';`
Expected: incluye `areas_manager_user_id_fkey` (nombre usado en `AREA_SELECT`). Si difiere, ajustar el alias.

- [ ] **Step 3: Exportar desde el barrel**

Añadir a `packages/db/src/index.ts`: `export * from "./repositories/areas";` (orden alfabético, junto a los demás `repositories/*`).

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: verde.

- [ ] **Step 5: Commit**

(Solo cuando Yesid lo pida.)

## Task 3: Repo `job-titles.ts`

**Files:**
- Create: `packages/db/src/repositories/job-titles.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Produces: `type JobTitleRow = Tables<"job_titles">`; `listJobTitles(db, areaId): Promise<JobTitleRow[]>`; `createJobTitle(db, { organizationId, areaId, name }): Promise<JobTitleRow>`; `renameJobTitle(db, id, name): Promise<void>`.

- [ ] **Step 1: Implementar**

```ts
import type { Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type JobTitleRow = Tables<"job_titles">;

export async function listJobTitles(db: Db, areaId: string): Promise<JobTitleRow[]> {
  const { data, error } = await db.from("job_titles").select("*").eq("area_id", areaId).order("name");
  if (error) throw error;
  return data ?? [];
}

export async function createJobTitle(
  db: Db,
  values: { organizationId: string; areaId: string; name: string },
): Promise<JobTitleRow> {
  const insert: TablesInsert<"job_titles"> = {
    organization_id: values.organizationId,
    area_id: values.areaId,
    name: values.name,
  };
  const { data, error } = await db.from("job_titles").insert(insert).select("*").single();
  if (error) throw error;
  return data;
}

export async function renameJobTitle(db: Db, id: string, name: string): Promise<void> {
  const { error } = await db
    .from("job_titles")
    .update({ name, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 2: Exportar desde el barrel**

Añadir a `packages/db/src/index.ts`: `export * from "./repositories/job-titles";`

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck`
Expected: verde.

- [ ] **Step 4: Commit**

(Solo cuando Yesid lo pida.)

## Task 4: Tipos generados + `people.ts`/`users.ts`

**Files:**
- Modify: `packages/db/src/types/database.ts` (bloques `areas`, `job_titles`; columnas nuevas en `people`)
- Modify: `packages/db/src/repositories/people.ts`
- Modify: `packages/db/src/repositories/users.ts`

**Interfaces:**
- Produces: `assignPersonJobTitle(db, personId, jobTitleId): Promise<void>` en `people.ts`; `OrgUser` gana `areaId: string | null; areaName: string | null`.

- [ ] **Step 1: Tipos** — añadir (orden alfabético, junto a `activity`/`assignees` de `work_item_*`, y en la sección de tablas generales junto a `people`/`users`) los bloques `areas` y `job_titles` (`Row`/`Insert`/`Update`, `Relationships: []`), siguiendo exactamente el patrón de `work_item_time_entries` (Row con todas las columnas no-opcionales salvo las que tienen default; Insert con `id?`/`created_at?`/`updated_at?`/`manager_user_id?` opcionales). Añadir `area_id: string | null` y `job_title_id: string | null` al `Row`/`Insert`/`Update` de `people`.

- [ ] **Step 2: `people.ts`** — añadir al final:

```ts
/** Asigna el cargo de una persona DENTRO de su área. Protegido por la policy
 * people_manager_update (034): solo el gerente del área de esa persona, o
 * super admin (que además pasa por su propio camino en `people_write`). */
export async function assignPersonJobTitle(
  db: Db,
  personId: string,
  jobTitleId: string | null,
): Promise<void> {
  const { error } = await db.from("people").update({ job_title_id: jobTitleId }).eq("id", personId);
  if (error) throw error;
}
```

- [ ] **Step 3: `users.ts`** — ampliar `OrgUser`/`OrgUserRow`/`listOrgUsers`

En `OrgUser`, añadir `areaId: string | null; areaName: string | null;`. En `OrgUserRow.person`, añadir `area_id: string | null; area: { id: string; name: string } | null;`. En el `.select(...)` de `listOrgUsers`, cambiar:

```ts
"id, person:people!inner(full_name, email, avatar_url, area_id, area:areas(id, name)), user_roles(id, organization_id, roles(code, name, module_code))"
```

Y en el `.map(...)` de retorno, añadir:

```ts
areaId: row.person?.area_id ?? null,
areaName: row.person?.area?.name ?? null,
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck`
Expected: verde.

- [ ] **Step 5: Commit**

(Solo cuando Yesid lo pida.)

## Task 5: Server actions en `access-actions.ts`

**Files:**
- Modify: `apps/web/lib/access-actions.ts`

**Interfaces:**
- Consumes: `createArea`, `updateAreaManager` de `@agency-os/db`.
- Produces: `createAreaAction(name, managerUserId): Promise<AccessActionResult>`; `updateAreaManagerAction(areaId, managerUserId): Promise<AccessActionResult>`; `assignPersonAreaAction(personId, areaId): Promise<AccessActionResult>`.

- [ ] **Step 1: Implementar**

Añadir al final de `apps/web/lib/access-actions.ts`:

```ts
export async function createAreaAction(name: string, managerUserId: string): Promise<AccessActionResult> {
  const auth = await requireSuperAdmin();
  if (auth.error !== undefined) return { error: auth.error };
  if (!name.trim() || !managerUserId) return { error: "Nombre y gerente son obligatorios." };

  try {
    const db = await getSupabaseServerClient();
    await createArea(db, { organizationId: auth.organizationId, name: name.trim(), managerUserId });
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    console.error("createAreaAction", error);
    return { error: "No se pudo crear el área. Intenta de nuevo." };
  }
}

export async function updateAreaManagerAction(
  areaId: string,
  managerUserId: string,
): Promise<AccessActionResult> {
  const auth = await requireSuperAdmin();
  if (auth.error !== undefined) return { error: auth.error };
  if (!managerUserId) return { error: "Selecciona un gerente." };

  try {
    const db = await getSupabaseServerClient();
    await updateAreaManager(db, areaId, managerUserId);
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    console.error("updateAreaManagerAction", error);
    return { error: "No se pudo actualizar el gerente. Intenta de nuevo." };
  }
}

/** Asigna el ÁREA de una persona (distinto del cargo). Usa service_role porque
 * ninguna policy de `people` cubre este caso (solo super admin puede hacerlo,
 * igual que inviteUser/deleteUser arriba). */
export async function assignPersonAreaAction(
  personId: string,
  areaId: string | null,
): Promise<AccessActionResult> {
  const auth = await requireSuperAdmin();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const admin = createSupabaseServiceRoleClient();
    const { error } = await admin
      .from("people")
      .update({ area_id: areaId })
      .eq("id", personId)
      .eq("organization_id", auth.organizationId);
    if (error) throw error;
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    console.error("assignPersonAreaAction", error);
    return { error: "No se pudo asignar el área. Intenta de nuevo." };
  }
}
```

Actualizar el import de `@agency-os/db` arriba del archivo para incluir `createArea`, `updateAreaManager` junto a `grantUserRole`/`revokeUserRole`.

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes.

- [ ] **Step 3: Commit**

(Solo cuando Yesid lo pida.)

## Task 6: UI — `AreasManager` (catálogo de áreas)

**Files:**
- Create: `apps/web/components/access/areas-manager.tsx`

**Interfaces:**
- Consumes: `createAreaAction`, `updateAreaManagerAction` (Task 5).
- Produces: `interface AreaRow { id: string; name: string; managerUserId: string | null; managerName: string | null }`; `<AreasManager areas={AreaRow[]} users={{id,fullName}[]} />`.

- [ ] **Step 1: Implementar**

```tsx
"use client";

// Catálogo de Áreas (solo super admin, vive en /usuarios): crear un área con
// su gerente, o cambiar el gerente de una ya creada. Borrar áreas no está en
// alcance (ver spec).

import { useState, useTransition } from "react";
import { Button, Label, Modal, Select, Table, Td, Th } from "@agency-os/ui";
import { createAreaAction, updateAreaManagerAction } from "@/lib/access-actions";

export interface AreaRow {
  id: string;
  name: string;
  managerUserId: string | null;
  managerName: string | null;
}

interface AreasManagerProps {
  areas: AreaRow[];
  users: { id: string; fullName: string }[];
}

export function AreasManager({ areas, users }: AreasManagerProps) {
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AreaRow | null>(null);
  const [name, setName] = useState("");
  const [managerUserId, setManagerUserId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openCreate = () => {
    setCreating(true);
    setName("");
    setManagerUserId("");
    setError(null);
  };

  const submitCreate = () => {
    if (!name.trim() || !managerUserId) return;
    startTransition(async () => {
      const result = await createAreaAction(name, managerUserId);
      if (result.error) setError(result.error);
      else setCreating(false);
    });
  };

  const openEdit = (area: AreaRow) => {
    setEditing(area);
    setManagerUserId(area.managerUserId ?? "");
    setError(null);
  };

  const submitEdit = () => {
    if (!editing || !managerUserId) return;
    startTransition(async () => {
      const result = await updateAreaManagerAction(editing.id, managerUserId);
      if (result.error) setError(result.error);
      else setEditing(null);
    });
  };

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-bold tracking-tight">Áreas</h2>
        <Button variant="outline" size="sm" onClick={openCreate}>
          + Nueva área
        </Button>
      </div>

      {areas.length === 0 ? (
        <p className="mt-3 text-sm text-muted">Todavía no hay áreas creadas.</p>
      ) : (
        <div className="mt-3">
          <Table>
            <thead>
              <tr>
                <Th>Área</Th>
                <Th>Gerente</Th>
                <Th className="text-right"> </Th>
              </tr>
            </thead>
            <tbody>
              {areas.map((a) => (
                <tr key={a.id} className="transition hover:bg-surface-2">
                  <Td>{a.name}</Td>
                  <Td>{a.managerName ?? "—"}</Td>
                  <Td className="text-right">
                    <Button variant="outline" size="sm" onClick={() => openEdit(a)}>
                      Cambiar gerente
                    </Button>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Nueva área"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button onClick={submitCreate} disabled={pending || !name.trim() || !managerUserId}>
              {pending ? "Creando…" : "Crear"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="area-name">Nombre</Label>
            <input
              id="area-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej. Diseño"
              className="w-full rounded border border-line-strong bg-surface px-3.5 py-3 text-sm text-ink outline-none focus:border-green"
            />
          </div>
          <div>
            <Label htmlFor="area-manager">Gerente</Label>
            <Select id="area-manager" value={managerUserId} onChange={(e) => setManagerUserId(e.target.value)}>
              <option value="">Selecciona un usuario…</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.fullName}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {error && creating && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title="Cambiar gerente"
        description={editing ? `Área "${editing.name}".` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={submitEdit} disabled={pending || !managerUserId}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <Label htmlFor="area-manager-edit">Gerente</Label>
        <Select id="area-manager-edit" value={managerUserId} onChange={(e) => setManagerUserId(e.target.value)}>
          <option value="">Selecciona un usuario…</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.fullName}
            </option>
          ))}
        </Select>
        {error && editing && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes.

- [ ] **Step 3: Commit**

(Solo cuando Yesid lo pida.)

## Task 7: UI — Área por usuario en `AccessManager` + montar `AreasManager` en la página

**Files:**
- Modify: `apps/web/components/access/access-manager.tsx`
- Modify: `apps/web/app/(app)/(hub)/usuarios/page.tsx`

**Interfaces:**
- Consumes: `assignPersonAreaAction` (Task 5); `AreasManager` (Task 6).
- Produces: `AccessUserRow` gana `personId: string; areaId: string | null; areaName: string | null`; nuevo prop `areas: {id, name}[]` en `AccessManager`.

- [ ] **Step 1: `access-manager.tsx`** — ampliar

Añadir al import: `assignPersonAreaAction` junto a `deleteUser, grantRole, inviteUser, revokeRole`. Ampliar `AccessUserRow`:

```ts
export interface AccessUserRow {
  id: string;
  personId: string;
  fullName: string;
  email: string | null;
  areaId: string | null;
  areaName: string | null;
  roles: { userRoleId: string; roleCode: string; roleName: string; moduleCode: string | null }[];
}
```

Añadir estado y handlers (junto a `assigning`/`deleting`):

```ts
const [assigningArea, setAssigningArea] = useState<AccessUserRow | null>(null);
const [areaId, setAreaId] = useState("");

const openAssignArea = (user: AccessUserRow) => {
  setAssigningArea(user);
  setAreaId(user.areaId ?? "");
  setError(null);
};

const submitAssignArea = () => {
  if (!assigningArea) return;
  startTransition(async () => {
    const result = await assignPersonAreaAction(assigningArea.personId, areaId || null);
    if (result.error) setError(result.error);
    else setAssigningArea(null);
  });
};
```

Prop `areas: { id: string; name: string }[]` en `AccessManagerProps`. En la fila de la tabla, añadir una `<Td>` de Área ANTES de la de Accesos:

```tsx
<Td>{user.areaName ?? <span className="text-faint">Sin área</span>}</Td>
```

Y en la columna de acciones, junto al botón "Asignar rol":

```tsx
<Button variant="outline" size="sm" onClick={() => openAssignArea(user)}>
  Área
</Button>
```

Añadir el `<Th>Área</Th>` correspondiente en el `<thead>`. Añadir el modal (mismo patrón que "Asignar rol"):

```tsx
<Modal
  open={assigningArea !== null}
  onClose={() => setAssigningArea(null)}
  title="Asignar área"
  description={assigningArea ? `Área de ${assigningArea.fullName}.` : undefined}
  footer={
    <>
      <Button variant="outline" onClick={() => setAssigningArea(null)}>
        Cancelar
      </Button>
      <Button onClick={submitAssignArea} disabled={pending}>
        {pending ? "Guardando…" : "Guardar"}
      </Button>
    </>
  }
>
  <Label htmlFor="assign-area">Área</Label>
  <Select id="assign-area" value={areaId} onChange={(e) => setAreaId(e.target.value)}>
    <option value="">Sin área</option>
    {areas.map((a) => (
      <option key={a.id} value={a.id}>
        {a.name}
      </option>
    ))}
  </Select>
  {error && assigningArea && <p className="mt-2 text-sm text-danger">{error}</p>}
</Modal>
```

- [ ] **Step 2: `usuarios/page.tsx`** — cargar áreas y montar `AreasManager`

```tsx
import { listAreas, listAssignableRoles, listModules, listOrgUsers } from "@agency-os/db";
import { AreasManager } from "@/components/access/areas-manager";
// ...
const [users, roles, modules, areas] = await Promise.all([
  listOrgUsers(db, organizationId),
  listAssignableRoles(db),
  listModules(db),
  listAreas(db, organizationId),
]);

return (
  <>
    <AccessManager
      users={users.map((u) => ({
        id: u.id,
        personId: u.id, // ver nota
        fullName: u.fullName,
        email: u.email,
        areaId: u.areaId,
        areaName: u.areaName,
        roles: u.roles,
      }))}
      roles={roles.map((r) => ({ id: r.id, name: r.name, moduleCode: r.module_code }))}
      modules={modules.map((m) => ({ code: m.code, name: m.name }))}
      areas={areas.map((a) => ({ id: a.id, name: a.name }))}
      currentUserId={user.id}
    />
    <AreasManager
      areas={areas.map((a) => ({ id: a.id, name: a.name, managerUserId: a.manager_user_id, managerName: a.managerName }))}
      users={users.map((u) => ({ id: u.id, fullName: u.fullName }))}
    />
  </>
);
```

**Nota sobre `personId`:** `assignPersonAreaAction` recibe el id de la fila `people`, no el de `users`. `listOrgUsers` selecciona `users.id` como `id` pero no expone el `person_id` por separado hoy. Antes de este paso, añadir `personId: string` a `OrgUser`/`OrgUserRow` en `users.ts` (Task 4) seleccionando `person_id` junto a `id` en el `.select(...)` de `listOrgUsers`, y mapeándolo en el `.map(...)` de retorno. Usar ese `u.personId` (no `u.id`) al construir `personId` arriba.

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes.

- [ ] **Step 4: Commit**

(Solo cuando Yesid lo pida.)

## Task 8: Checkpoint Fase 1 (Yesid)

- [ ] Crear un área "Diseño" con gerente = un usuario de prueba.
- [ ] Cambiar el gerente de esa área a otro usuario.
- [ ] Asignar el área "Diseño" a un par de personas desde `/usuarios`.
- [ ] Confirmar que `/perfil` (nombre/avatar) sigue funcionando (regresión de la policy `people_manager_update` nueva — no debería afectar `people_self_update`).

---

# FASE 2 — Página `/mi-area`

## Task 9: Repos — tareas abiertas por asignado, minutos por rango de usuarios

**Files:**
- Modify: `packages/db/src/repositories/work-items.ts`
- Modify: `packages/db/src/repositories/work-item-time.ts`

**Interfaces:**
- Produces: `countOpenTasksByAssignee(db, { organizationId, userIds }): Promise<Record<string, number>>`; `sumMinutesByUsersInRange(db, { organizationId, userIds, from, to }): Promise<Record<string, number>>`.

- [ ] **Step 1: `work-items.ts`** — añadir tras `countOverdueTasksInProjects`:

```ts
/** Cuenta tareas/subtareas ABIERTAS (no "hecho", no borradas) asignadas a cada
 * usuario de `userIds`, sin importar el proyecto — para "Carga del equipo". */
export async function countOpenTasksByAssignee(
  db: Db,
  opts: { organizationId: string; userIds: string[] },
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (opts.userIds.length === 0) return out;
  const idSet = new Set(opts.userIds);
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db
      .from("work_items")
      .select(
        "id, status:work_item_statuses!work_items_status_fk(is_done), assignees:work_item_assignees(user_id)",
      )
      .eq("organization_id", opts.organizationId)
      .in("type", ["task", "subtask"])
      .is("deleted_at", null)
      .range(from, from + pageSize - 1)
      .returns<{ id: string; status: { is_done: boolean } | null; assignees: { user_id: string }[] }[]>();
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.status?.is_done) continue;
      for (const a of row.assignees) {
        if (idSet.has(a.user_id)) out[a.user_id] = (out[a.user_id] ?? 0) + 1;
      }
    }
    if (!data || data.length < pageSize) break;
  }
  return out;
}
```

- [ ] **Step 2: `work-item-time.ts`** — añadir al final:

```ts
/** Minutos por usuario dentro de un rango de fechas — para "Carga del
 * equipo" (tiempo de la semana de cada colaborador). */
export async function sumMinutesByUsersInRange(
  db: Db,
  opts: { organizationId: string; userIds: string[]; from: string; to: string },
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  if (opts.userIds.length === 0) return out;
  const { data, error } = await db
    .from("work_item_time_entries")
    .select("user_id, minutes")
    .eq("organization_id", opts.organizationId)
    .in("user_id", opts.userIds)
    .gte("spent_on", opts.from)
    .lte("spent_on", opts.to);
  if (error) throw error;
  for (const r of data ?? []) out[r.user_id] = (out[r.user_id] ?? 0) + r.minutes;
  return out;
}
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes.

- [ ] **Step 4: Commit**

(Solo cuando Yesid lo pida.)

## Task 10: Dominio — `currentWeekRange`

**Files:**
- Modify: `packages/domain/src/format.ts`
- Modify: `packages/domain/src/format.test.ts`

**Interfaces:**
- Produces: `currentWeekRange(today?: Date): { from: string; to: string }` (lunes a domingo, `YYYY-MM-DD` en fecha LOCAL, no UTC).

- [ ] **Step 1: Escribir el test que falla**

Añadir a `packages/domain/src/format.test.ts` (importar `currentWeekRange` junto a los demás):

```ts
describe("currentWeekRange", () => {
  it("domingo (2026-09-06) -> semana que empezó el lunes 2026-08-31", () => {
    expect(currentWeekRange(new Date(2026, 8, 6))).toEqual({ from: "2026-08-31", to: "2026-09-06" });
  });
  it("miércoles (2026-09-02) -> misma semana lunes a domingo", () => {
    expect(currentWeekRange(new Date(2026, 8, 2))).toEqual({ from: "2026-08-31", to: "2026-09-06" });
  });
  it("lunes (2026-08-31) -> desde ese mismo lunes", () => {
    expect(currentWeekRange(new Date(2026, 8, 31))).toEqual({ from: "2026-08-31", to: "2026-09-06" });
  });
});
```

- [ ] **Step 2: Correr y verificar que falla**

Run: `pnpm --filter @agency-os/domain test`
Expected: FAIL ("currentWeekRange is not exported").

- [ ] **Step 3: Implementar**

Añadir a `packages/domain/src/format.ts`:

```ts
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Rango lunes-domingo (fechas LOCALES, no UTC) de la semana que contiene
 * `today`. `today` se inyecta para poder testear de forma determinista. */
export function currentWeekRange(today: Date = new Date()): { from: string; to: string } {
  const day = today.getDay(); // 0=domingo..6=sábado
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + diffToMonday);
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { from: formatLocalDate(monday), to: formatLocalDate(sunday) };
}
```

- [ ] **Step 4: Correr y verificar que pasa**

Run: `pnpm --filter @agency-os/domain test`
Expected: PASS.

- [ ] **Step 5: Commit**

(Solo cuando Yesid lo pida.)

## Task 11: Server actions `mi-area-actions.ts`

**Files:**
- Create: `apps/web/lib/mi-area-actions.ts`

**Interfaces:**
- Consumes: `getArea`, `createJobTitle`, `renameJobTitle`, `assignPersonJobTitle` de `@agency-os/db`; `getCurrentUser` de `@/lib/auth`.
- Produces: `type AccessActionResult = { ok: true; error?: never } | { ok?: never; error: string }`; `createJobTitleAction(areaId, name): Promise<AccessActionResult>`; `renameJobTitleAction(id, areaId, name): Promise<AccessActionResult>`; `assignPersonJobTitleAction(personId, areaId, jobTitleId): Promise<AccessActionResult>`.

- [ ] **Step 1: Implementar**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { assignPersonJobTitle, createJobTitle, getArea, renameJobTitle } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type AccessActionResult = { ok: true; error?: never } | { ok?: never; error: string };

/** Guarda: super admin, o gerente de ESTA área puntual (`areaId`). Puerta de
 * dueño, no de permiso de rol — igual que "autor del comentario". */
async function requireAreaManager(areaId: string) {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." } as const;
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." } as const;
  if (user.isSuper) return { organizationId } as const;

  const db = await getSupabaseServerClient();
  const area = await getArea(db, areaId);
  if (!area || area.organization_id !== organizationId || area.manager_user_id !== user.id) {
    return { error: "No administras esta área." } as const;
  }
  return { organizationId } as const;
}

export async function createJobTitleAction(areaId: string, name: string): Promise<AccessActionResult> {
  const auth = await requireAreaManager(areaId);
  if (auth.error !== undefined) return { error: auth.error };
  if (!name.trim()) return { error: "El nombre es obligatorio." };

  try {
    const db = await getSupabaseServerClient();
    await createJobTitle(db, { organizationId: auth.organizationId, areaId, name: name.trim() });
    revalidatePath("/mi-area");
    return { ok: true };
  } catch (error) {
    console.error("createJobTitleAction", error);
    return { error: "No se pudo crear el cargo. Intenta de nuevo." };
  }
}

export async function renameJobTitleAction(
  id: string,
  areaId: string,
  name: string,
): Promise<AccessActionResult> {
  const auth = await requireAreaManager(areaId);
  if (auth.error !== undefined) return { error: auth.error };
  if (!name.trim()) return { error: "El nombre es obligatorio." };

  try {
    const db = await getSupabaseServerClient();
    await renameJobTitle(db, id, name.trim());
    revalidatePath("/mi-area");
    return { ok: true };
  } catch (error) {
    console.error("renameJobTitleAction", error);
    return { error: "No se pudo renombrar el cargo. Intenta de nuevo." };
  }
}

export async function assignPersonJobTitleAction(
  personId: string,
  areaId: string,
  jobTitleId: string | null,
): Promise<AccessActionResult> {
  const auth = await requireAreaManager(areaId);
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    await assignPersonJobTitle(db, personId, jobTitleId);
    revalidatePath("/mi-area");
    return { ok: true };
  } catch (error) {
    console.error("assignPersonJobTitleAction", error);
    return { error: "No se pudo asignar el cargo. Intenta de nuevo." };
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes.

- [ ] **Step 3: Commit**

(Solo cuando Yesid lo pida.)

## Task 12: UI — `JobTitlesManager`, `AreaCollaborators`, `TeamWorkloadCards`

**Files:**
- Create: `apps/web/components/mi-area/job-titles-manager.tsx`
- Create: `apps/web/components/mi-area/area-collaborators.tsx`
- Create: `apps/web/components/mi-area/team-workload-cards.tsx`

**Interfaces:**
- Consumes: `createJobTitleAction`, `renameJobTitleAction`, `assignPersonJobTitleAction` (Task 11); `formatDuration` de `@agency-os/domain`.
- Produces: `<JobTitlesManager areaId jobTitles={{id,name}[]} />`; `<AreaCollaborators areaId people={{id,fullName,jobTitleId,jobTitleName}[]} jobTitles={{id,name}[]} />`; `<TeamWorkloadCards people={{id,fullName,openTasks,minutesThisWeek}[]} />`.

- [ ] **Step 1: `job-titles-manager.tsx`**

```tsx
"use client";

// Catálogo de cargos del área (gerente): crear + renombrar. Sin borrar (fuera
// de alcance del spec).

import { useState, useTransition } from "react";
import { Button, Input } from "@agency-os/ui";
import { createJobTitleAction, renameJobTitleAction } from "@/lib/mi-area-actions";

export interface JobTitleOption {
  id: string;
  name: string;
}

export function JobTitlesManager({ areaId, jobTitles }: { areaId: string; jobTitles: JobTitleOption[] }) {
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onCreate = () => {
    if (!newName.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await createJobTitleAction(areaId, newName);
      if (res.error) setError(res.error);
      else setNewName("");
    });
  };

  const startEdit = (jt: JobTitleOption) => {
    setEditingId(jt.id);
    setEditName(jt.name);
    setError(null);
  };

  const onRename = () => {
    if (!editingId || !editName.trim()) return;
    startTransition(async () => {
      const res = await renameJobTitleAction(editingId, areaId, editName);
      if (res.error) setError(res.error);
      else setEditingId(null);
    });
  };

  return (
    <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
      <h2 className="font-semibold text-ink">Cargos de mi área</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {jobTitles.map((jt) =>
          editingId === jt.id ? (
            <div key={jt.id} className="flex items-center gap-1.5">
              <Input
                autoFocus
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-40"
              />
              <Button size="sm" onClick={onRename} disabled={pending}>
                Guardar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                Cancelar
              </Button>
            </div>
          ) : (
            <button
              key={jt.id}
              type="button"
              onClick={() => startEdit(jt)}
              className="rounded-pill border border-line-strong px-3 py-1.5 text-sm text-ink transition hover:border-green"
            >
              {jt.name}
            </button>
          ),
        )}
        {jobTitles.length === 0 && <p className="text-sm text-muted">Todavía no hay cargos.</p>}
      </div>
      <div className="mt-4 flex items-center gap-2">
        <Input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onCreate()}
          placeholder="Nuevo cargo…"
          className="w-56"
        />
        <Button size="sm" onClick={onCreate} disabled={pending || !newName.trim()}>
          Agregar
        </Button>
      </div>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}
    </section>
  );
}
```

- [ ] **Step 2: `area-collaborators.tsx`**

```tsx
"use client";

// Colaboradores del área (gerente): asignar/cambiar el cargo de cada uno.

import { useState, useTransition } from "react";
import { Badge, Button, Label, Modal, Select, Table, Td, Th } from "@agency-os/ui";
import { assignPersonJobTitleAction } from "@/lib/mi-area-actions";
import type { JobTitleOption } from "./job-titles-manager";

export interface AreaCollaborator {
  id: string;
  fullName: string;
  jobTitleId: string | null;
  jobTitleName: string | null;
}

export function AreaCollaborators({
  areaId,
  people,
  jobTitles,
}: {
  areaId: string;
  people: AreaCollaborator[];
  jobTitles: JobTitleOption[];
}) {
  const [assigning, setAssigning] = useState<AreaCollaborator | null>(null);
  const [jobTitleId, setJobTitleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openAssign = (person: AreaCollaborator) => {
    setAssigning(person);
    setJobTitleId(person.jobTitleId ?? "");
    setError(null);
  };

  const submit = () => {
    if (!assigning) return;
    startTransition(async () => {
      const res = await assignPersonJobTitleAction(assigning.id, areaId, jobTitleId || null);
      if (res.error) setError(res.error);
      else setAssigning(null);
    });
  };

  return (
    <section className="mt-6 rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
      <h2 className="font-semibold text-ink">Colaboradores de mi área</h2>
      <div className="mt-3">
        <Table>
          <thead>
            <tr>
              <Th>Nombre</Th>
              <Th>Cargo</Th>
              <Th className="text-right"> </Th>
            </tr>
          </thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id} className="transition hover:bg-surface-2">
                <Td>{p.fullName}</Td>
                <Td>{p.jobTitleName ? <Badge tone="neutral">{p.jobTitleName}</Badge> : "—"}</Td>
                <Td className="text-right">
                  <Button variant="outline" size="sm" onClick={() => openAssign(p)}>
                    Asignar cargo
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
        {people.length === 0 && <p className="mt-3 text-sm text-muted">Todavía no hay colaboradores en esta área.</p>}
      </div>

      <Modal
        open={assigning !== null}
        onClose={() => setAssigning(null)}
        title="Asignar cargo"
        description={assigning ? `Cargo de ${assigning.fullName}.` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setAssigning(null)}>
              Cancelar
            </Button>
            <Button onClick={submit} disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <Label htmlFor="assign-job-title">Cargo</Label>
        <Select id="assign-job-title" value={jobTitleId} onChange={(e) => setJobTitleId(e.target.value)}>
          <option value="">Sin cargo</option>
          {jobTitles.map((jt) => (
            <option key={jt.id} value={jt.id}>
              {jt.name}
            </option>
          ))}
        </Select>
        {error && assigning && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>
    </section>
  );
}
```

- [ ] **Step 3: `team-workload-cards.tsx`**

```tsx
// "Carga del equipo": una card por colaborador con tareas abiertas + tiempo de
// la semana. Presentacional, sin interacción — server component.

import { formatDuration } from "@agency-os/domain";

export interface TeamWorkloadPerson {
  id: string;
  fullName: string;
  openTasks: number;
  minutesThisWeek: number;
}

export function TeamWorkloadCards({ people }: { people: TeamWorkloadPerson[] }) {
  if (people.length === 0) {
    return <p className="mt-3 text-sm text-muted">Todavía no hay colaboradores en esta área.</p>;
  }
  return (
    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {people.map((p) => (
        <div key={p.id} className="rounded-lg border border-line bg-glass p-4 backdrop-blur-xl">
          <div className="font-semibold text-ink">{p.fullName}</div>
          <div className="mt-2 flex items-center justify-between text-sm">
            <span className="text-muted">Tareas abiertas</span>
            <span className="font-semibold tabular-nums text-ink">{p.openTasks}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-sm">
            <span className="text-muted">Esta semana</span>
            <span className="font-semibold tabular-nums text-ink">
              {p.minutesThisWeek > 0 ? formatDuration(p.minutesThisWeek) : "0m"}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes.

- [ ] **Step 5: Commit**

(Solo cuando Yesid lo pida.)

## Task 13: Página `/mi-area`

**Files:**
- Create: `apps/web/app/(app)/(hub)/mi-area/page.tsx`

**Interfaces:**
- Consumes: `listAreasManagedBy`, `listAreas`, `listJobTitles`, `listPeopleInArea`, `countOpenTasksByAssignee`, `sumMinutesByUsersInRange` de `@agency-os/db`; `currentWeekRange` de `@agency-os/domain`; `JobTitlesManager`, `AreaCollaborators`, `TeamWorkloadCards` (Task 12); `NoAccessPanel`.

- [ ] **Step 1: Implementar**

```tsx
import { redirect } from "next/navigation";
import {
  countOpenTasksByAssignee,
  listAreas,
  listAreasManagedBy,
  listJobTitles,
  listPeopleInArea,
  sumMinutesByUsersInRange,
} from "@agency-os/db";
import { currentWeekRange } from "@agency-os/domain";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { NoAccessPanel } from "@/components/no-access-panel";
import { JobTitlesManager } from "@/components/mi-area/job-titles-manager";
import { AreaCollaborators } from "@/components/mi-area/area-collaborators";
import { TeamWorkloadCards } from "@/components/mi-area/team-workload-cards";

export const dynamic = "force-dynamic";

export default async function MiAreaPage({
  searchParams,
}: {
  searchParams: { area?: string };
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const organizationId = user.organizationIds[0] ?? "";
  const db = await getSupabaseServerClient();
  const manageable = user.isSuper
    ? await listAreas(db, organizationId)
    : await listAreasManagedBy(db, user.id);

  if (manageable.length === 0) {
    return (
      <div className="mx-auto max-w-[560px]">
        <NoAccessPanel
          title="No administras ninguna área"
          message="Esta sección es para el gerente de un área (o el Administrador de sistema)."
        />
      </div>
    );
  }

  const selected = manageable.find((a) => a.id === searchParams.area) ?? manageable[0]!;

  const [jobTitles, people] = await Promise.all([
    listJobTitles(db, selected.id),
    listPeopleInArea(db, selected.id),
  ]);

  const userIds = people.map((p) => p.id);
  const { from, to } = currentWeekRange();
  const [openTasksByUser, minutesByUser] = await Promise.all([
    countOpenTasksByAssignee(db, { organizationId, userIds }),
    sumMinutesByUsersInRange(db, { organizationId, userIds, from, to }),
  ]);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Mi área</h1>
        {manageable.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {manageable.map((a) => (
              <a
                key={a.id}
                href={`/mi-area?area=${a.id}`}
                className={`rounded-pill border px-3.5 py-2 text-sm font-semibold transition ${
                  a.id === selected.id
                    ? "border-green bg-green text-green-ink"
                    : "border-line-strong text-muted hover:text-ink"
                }`}
              >
                {a.name}
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6">
        <JobTitlesManager areaId={selected.id} jobTitles={jobTitles.map((jt) => ({ id: jt.id, name: jt.name }))} />
        <AreaCollaborators
          areaId={selected.id}
          people={people}
          jobTitles={jobTitles.map((jt) => ({ id: jt.id, name: jt.name }))}
        />
      </div>

      <div className="mt-6">
        <h2 className="text-lg font-bold tracking-tight">Carga del equipo</h2>
        <TeamWorkloadCards
          people={people.map((p) => ({
            id: p.id,
            fullName: p.fullName,
            openTasks: openTasksByUser[p.id] ?? 0,
            minutesThisWeek: minutesByUser[p.id] ?? 0,
          }))}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes.

- [ ] **Step 3: Commit**

(Solo cuando Yesid lo pida.)

## Task 14: Link "Mi área" en el hub

**Files:**
- Modify: `apps/web/components/hub-icons.tsx`
- Modify: `apps/web/app/(app)/(hub)/layout.tsx`

**Interfaces:**
- Produces: `AreaIcon` en `hub-icons.tsx`.

- [ ] **Step 1: Icono** — añadir a `hub-icons.tsx`:

```tsx
export function AreaIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </svg>
  );
}
```

- [ ] **Step 2: Layout** — en `apps/web/app/(app)/(hub)/layout.tsx`, determinar si el usuario administra alguna área:

```ts
import { listAreasManagedBy } from "@agency-os/db";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { AreaIcon, HomeIcon, ProfileIcon, UsersIcon } from "@/components/hub-icons";
// ...
const db = await getSupabaseServerClient();
const managedAreas = user.isSuper ? [{ id: "any" }] : await listAreasManagedBy(db, user.id);
const canSeeMiArea = user.isSuper || managedAreas.length > 0;

const items: HubNavItem[] = [
  { href: "/inicio", label: "Inicio", icon: <HomeIcon /> },
  ...(canSeeMiArea ? [{ href: "/mi-area", label: "Mi área", icon: <AreaIcon /> }] : []),
  ...(user.isSuper ? [{ href: "/usuarios", label: "Usuarios", icon: <UsersIcon /> }] : []),
  { href: "/perfil", label: "Mi perfil", icon: <ProfileIcon /> },
];
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes.

- [ ] **Step 4: Commit**

(Solo cuando Yesid lo pida.)

## Task 15: Checkpoint Fase 2 + memoria (Yesid)

- [ ] Como gerente del área de prueba: entrar a "Mi área" desde el hub, crear 2 cargos, asignárselos a los colaboradores del área.
- [ ] "Carga del equipo" muestra tareas abiertas y tiempo de esta semana por colaborador (verificar con un dato conocido: registrar tiempo hoy en una tarea de un colaborador de prueba y confirmar que aparece).
- [ ] Un usuario que NO administra ninguna área no ve el link "Mi área" y, si entra directo a `/mi-area`, ve el panel de "no administras ninguna área".
- [ ] Super admin ve TODAS las áreas en el selector de "Mi área".
- [ ] Actualizar memoria del proyecto con el estado de esta feature.

---

## Self-Review (autor del plan)

- **Cobertura de la spec:** Fase 1 (áreas + cargos + asignación desde `/usuarios`, super admin) ✓ Tasks 1-8; Fase 2 (`/mi-area`: cargos, colaboradores, Carga del equipo) ✓ Tasks 9-15. Cargo sin permisos ✓ (nunca se toca el sistema de roles). Una persona una sola área ✓ (columna única `area_id`, no tabla puente). RLS por dueño sin tocar las policies de `people` existentes ✓ (Task 1 solo AGREGA `people_manager_update`). `scope=team` de `/proyectos/tiempos` intacto ✓ (no se menciona ni se toca en ningún task).
- **Consistencia de tipos:** `AreaRow`/`JobTitleRow` (Task 2/3) consumidos igual en actions (Task 5/11) y en la page (Task 13). `AreaCollaborator`/`JobTitleOption`/`TeamWorkloadPerson` (Task 12) coinciden con lo que arma `page.tsx` (Task 13) a partir de `listPeopleInArea`/`listJobTitles`/los `Record<string number>` de Task 9.
- **Placeholders:** ninguno — todo el código de cada tarea es el archivo final o el bloque exacto a insertar, con nota explícita cuando depende de una tarea anterior (Task 7 sobre `personId`).
