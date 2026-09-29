# Carpetas para Agrupar Proyectos por Cliente Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agrupar los proyectos de un cliente en carpetas con nombre y color dentro de `/proyectos/[cliente]`, arrastrando proyectos entre carpetas — igual a como Yesid identificó que ya usan Folders/Lists en ClickUp.

**Architecture:** Tabla nueva `project_folders` (una por cliente) + columna `folder_id` en `work_items`. Solo se toca la vista de un cliente (`/proyectos/[cliente]`) cuando NO hay búsqueda activa — todo lo demás (`/proyectos` global, dashboard, `ProjectsList`) queda intacto. El drag&drop reutiliza el mecanismo nativo de HTML ya usado en el tablero Kanban (`project-board.tsx`); el selector de color reutiliza el patrón ya usado en `project-status-manager.tsx`.

**Tech Stack:** Next.js App Router (server actions + server components), Supabase (RLS estándar, sin service-role — esto no necesita bypass), React (client component con drag&drop nativo), TypeScript, Vitest (solo `packages/domain`).

## Global Constraints

- Body de commits y comentarios en español.
- No `git commit` sin que Yesid lo pida explícitamente.
- No modificar `apps/web/components/proyectos/projects-list.tsx` — se deja intacto para `/proyectos` global y el dashboard.
- No modificar `apps/web/lib/project-actions.ts` — el guard de permiso (`requireProjectManager`-equivalente) se duplica localmente en el archivo de acciones nuevo, seguido el mismo patrón ya establecido en el proyecto (los archivos de acciones no comparten estos guards triviales entre sí — ver `access-actions.ts`/`mi-area-actions.ts`/`proyectos-access-actions.ts`, cada uno con su propia copia).
- Un proyecto pertenece a como mucho UNA carpeta (`folder_id` nullable). Borrar una carpeta no bloquea nada — sus proyectos vuelven a "Sin carpeta" vía `on delete set null`.
- Verificación de cada tarea de código: `pnpm typecheck` limpio. No hay infra de tests de UI/server-actions en este repo — solo `packages/domain` tiene Vitest.

---

## Task 1: Migración — tabla `project_folders` + columna `folder_id`

**Files:**
- Create: `supabase/migrations/055_project_folders.sql`

**Interfaces:**
- Consumes: nada.
- Produces: tabla `public.project_folders` y columna `public.work_items.folder_id` — las consume todo lo demás (Tasks 3-7).

- [ ] **Step 1: Escribir la migración**

Crear `supabase/migrations/055_project_folders.sql`:

```sql
-- Agrupar proyectos de un cliente en carpetas con nombre y color (pedido de
-- Yesid tras ver cómo usan Folders/Lists en ClickUp para organizar el trabajo
-- de un cliente grande — ver Docs/superpowers/specs/2026-09-29-carpetas-proyectos-por-cliente-design.md).
--
-- OJO: existe una tabla `public.areas` que es de RRHH/organización interna
-- (departamentos con gerente, para medir carga de trabajo) — NO tiene relación
-- con esto. Por eso el nombre aquí es `project_folders`, no `areas`.
--
-- Una carpeta es de UN cliente (no compartida entre clientes, igual que en
-- ClickUp cada Space tiene sus propios Folders). Un proyecto pertenece a como
-- mucho una carpeta; borrar la carpeta no borra ni bloquea sus proyectos, solo
-- los deja "Sin carpeta" (on delete set null). Hard delete real de la carpeta
-- (sin deleted_at): no se bloquea el borrado en uso y no hay valor en retener
-- carpetas eliminadas.

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

-- Mismo patrón exacto que work_items/work_item_statuses: select por
-- organización, write (all) por organización + project.manage.
create policy project_folders_select on public.project_folders
  for select using (organization_id in (select public.current_user_organization_ids()));

create policy project_folders_write on public.project_folders
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('project.manage')
  );
```

- [ ] **Step 2: Aplicar la migración al proyecto real**

Usar la herramienta MCP `mcp__supabase__apply_migration` con `project_id: "hicbkpwywwhnhiawulmu"`, `name: "project_folders"`, y el SQL completo del Step 1 (sin el bloque de comentarios iniciales, o con ellos — el comentario SQL no afecta la ejecución).

Expected: `{"success": true}`.

- [ ] **Step 3: Regenerar los tipos de TypeScript**

Usar la herramienta MCP `mcp__supabase__generate_typescript_types` con `project_id: "hicbkpwywwhnhiawulmu"`, y escribir el resultado (`types` del JSON de respuesta) completo sobre `packages/db/src/types/database.ts` (reemplaza el archivo entero — es 100% generado, ver el mismo procedimiento ya usado para `quote_presence`).

Verificar: `grep -n "project_folders" packages/db/src/types/database.ts` debe encontrar la tabla nueva. `grep -n "folder_id" packages/db/src/types/database.ts` debe encontrarlo dentro de `work_items`.

- [ ] **Step 4: Verificar con el Advisor**

Usar `mcp__supabase__get_advisors` con `type: "security"` — no debe haber hallazgos nuevos más allá del baseline ya conocido (mismo set de siempre: `quote_code_counters` sin policy, `guard_system_quote_status` search_path, funciones `SECURITY DEFINER`, leaked password protection).

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/055_project_folders.sql packages/db/src/types/database.ts
git commit -m "feat(db): tabla project_folders + folder_id en work_items"
```

---

## Task 2: Función de dominio para agrupar proyectos por carpeta

**Files:**
- Create: `packages/domain/src/project-folders.ts`
- Create: `packages/domain/src/project-folders.test.ts`
- Modify: `packages/domain/src/index.ts` (agregar `export * from "./project-folders";` al final)

**Interfaces:**
- Consumes: nada (función pura).
- Produces: `groupProjectsByFolder<TFolder, TProject>(folders, projects): FolderGroup<TFolder, TProject>[]` — lo usa `apps/web/components/proyectos/projects-by-folder.tsx` (Task 6).

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/domain/src/project-folders.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { groupProjectsByFolder } from "./project-folders";

interface TestFolder {
  id: string;
  sortOrder: number;
}

interface TestProject {
  id: string;
  folderId: string | null;
}

describe("groupProjectsByFolder", () => {
  it("agrupa proyectos bajo su carpeta y deja el resto en 'Sin carpeta' (folder: null) al final", () => {
    const folders: TestFolder[] = [
      { id: "f1", sortOrder: 0 },
      { id: "f2", sortOrder: 1 },
    ];
    const projects: TestProject[] = [
      { id: "p1", folderId: "f1" },
      { id: "p2", folderId: null },
      { id: "p3", folderId: "f2" },
      { id: "p4", folderId: "f1" },
    ];
    const groups = groupProjectsByFolder(folders, projects);
    expect(groups).toEqual([
      { folder: folders[0], projects: [projects[0], projects[3]] },
      { folder: folders[1], projects: [projects[2]] },
      { folder: null, projects: [projects[1]] },
    ]);
  });

  it("ordena las carpetas por sortOrder", () => {
    const folders: TestFolder[] = [
      { id: "f2", sortOrder: 1 },
      { id: "f1", sortOrder: 0 },
    ];
    const groups = groupProjectsByFolder(folders, []);
    expect(groups.map((g) => g.folder?.id)).toEqual(["f1", "f2", null]);
  });

  it("incluye una carpeta vacía (0 proyectos) en vez de omitirla", () => {
    const folders: TestFolder[] = [{ id: "f1", sortOrder: 0 }];
    const groups = groupProjectsByFolder(folders, []);
    expect(groups).toEqual([
      { folder: folders[0], projects: [] },
      { folder: null, projects: [] },
    ]);
  });

  it("sin carpetas, solo devuelve el grupo 'Sin carpeta' con todos los proyectos", () => {
    const projects: TestProject[] = [{ id: "p1", folderId: null }];
    const groups = groupProjectsByFolder([], projects);
    expect(groups).toEqual([{ folder: null, projects }]);
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `pnpm --filter @agency-os/domain test -- project-folders`
Expected: FAIL — `Cannot find module './project-folders'`.

- [ ] **Step 3: Implementación mínima**

Crear `packages/domain/src/project-folders.ts`:

```typescript
export interface FolderGroup<TFolder, TProject> {
  /** `null` = el grupo "Sin carpeta". */
  folder: TFolder | null;
  projects: TProject[];
}

/** Agrupa `projects` bajo su `folderId`, en el orden de `sortOrder` de cada
 * carpeta, y agrega al final el grupo "Sin carpeta" (folder: null) con los
 * proyectos que no tienen `folderId`. Las carpetas sin proyectos SÍ se
 * incluyen (con `projects: []`) — la UI decide si ocultarlas o no. */
export function groupProjectsByFolder<
  TFolder extends { id: string; sortOrder: number },
  TProject extends { folderId: string | null },
>(folders: TFolder[], projects: TProject[]): FolderGroup<TFolder, TProject>[] {
  const sortedFolders = [...folders].sort((a, b) => a.sortOrder - b.sortOrder);
  const byFolder = new Map<string, TProject[]>();
  const unfiled: TProject[] = [];
  for (const project of projects) {
    if (project.folderId) {
      const list = byFolder.get(project.folderId);
      if (list) list.push(project);
      else byFolder.set(project.folderId, [project]);
    } else {
      unfiled.push(project);
    }
  }
  const groups: FolderGroup<TFolder, TProject>[] = sortedFolders.map((folder) => ({
    folder,
    projects: byFolder.get(folder.id) ?? [],
  }));
  groups.push({ folder: null, projects: unfiled });
  return groups;
}
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `pnpm --filter @agency-os/domain test -- project-folders`
Expected: PASS — 4 tests en verde.

- [ ] **Step 5: Exportarlo desde el índice del paquete**

Modificar `packages/domain/src/index.ts` — agregar al final (después de `export * from "./permission-groups";`):

```typescript
export * from "./project-folders";
```

- [ ] **Step 6: Typecheck del paquete**

Run: `pnpm --filter @agency-os/domain typecheck`
Expected: éxito.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/project-folders.ts packages/domain/src/project-folders.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): agrupar proyectos por carpeta para la vista de cliente"
```

---

## Task 3: Repositorio de carpetas + `setProjectFolder`

**Files:**
- Create: `packages/db/src/repositories/project-folders.ts`
- Modify: `packages/db/src/repositories/work-items.ts` (agregar `setProjectFolder` al final del archivo)
- Modify: `packages/db/src/index.ts` (agregar `export * from "./repositories/project-folders";`)

**Interfaces:**
- Consumes: `Db` de `./shared` (patrón estándar).
- Produces (los usa `apps/web/lib/project-folder-actions.ts`, Task 5):
  - `ProjectFolderRow` (tipo), `ProjectFolderInput` (interfaz)
  - `listProjectFolders(db: Db, clientId: string): Promise<ProjectFolderRow[]>`
  - `createProjectFolder(db: Db, input: { organizationId: string; clientId: string; name: string; color: string; createdBy: string }): Promise<ProjectFolderRow>`
  - `updateProjectFolder(db: Db, id: string, input: { name: string; color: string }): Promise<ProjectFolderRow>`
  - `deleteProjectFolder(db: Db, id: string): Promise<void>`
  - `reorderProjectFolders(db: Db, orderedIds: string[]): Promise<void>`
  - `getProjectFolderOrg(db: Db, id: string): Promise<{ organizationId: string; clientId: string } | null>` (para validar pertenencia antes de editar/borrar, mismo patrón que `assertStatusInOrg`)
  - `setProjectFolder(db: Db, projectId: string, folderId: string | null): Promise<void>` (en `work-items.ts`)

- [ ] **Step 1: Crear el repositorio de carpetas**

Crear `packages/db/src/repositories/project-folders.ts`:

```typescript
import type { Tables } from "../types/database";
import type { Db } from "./shared";

export type ProjectFolderRow = Tables<"project_folders">;

/** Carpetas de un cliente, en orden de `sort_order`. */
export async function listProjectFolders(db: Db, clientId: string): Promise<ProjectFolderRow[]> {
  const { data, error } = await db
    .from("project_folders")
    .select("*")
    .eq("client_id", clientId)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function createProjectFolder(
  db: Db,
  input: { organizationId: string; clientId: string; name: string; color: string; createdBy: string },
): Promise<ProjectFolderRow> {
  const { data: existing, error: countError } = await db
    .from("project_folders")
    .select("id", { count: "exact", head: true })
    .eq("client_id", input.clientId);
  if (countError) throw countError;
  const { data, error } = await db
    .from("project_folders")
    .insert({
      organization_id: input.organizationId,
      client_id: input.clientId,
      name: input.name.trim(),
      color: input.color,
      sort_order: existing?.length ?? 0,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateProjectFolder(
  db: Db,
  id: string,
  input: { name: string; color: string },
): Promise<ProjectFolderRow> {
  const { data, error } = await db
    .from("project_folders")
    .update({ name: input.name.trim(), color: input.color })
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteProjectFolder(db: Db, id: string): Promise<void> {
  const { error } = await db.from("project_folders").delete().eq("id", id);
  if (error) throw error;
}

export async function reorderProjectFolders(db: Db, orderedIds: string[]): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await db.from("project_folders").update({ sort_order: index }).eq("id", id);
    if (error) throw error;
  }
}

/** Confirma organización/cliente de una carpeta antes de editarla/borrarla —
 * mismo patrón de "defensa en profundidad" que `assertStatusInOrg` en
 * project-actions.ts. */
export async function getProjectFolderOrg(
  db: Db,
  id: string,
): Promise<{ organizationId: string; clientId: string } | null> {
  const { data, error } = await db
    .from("project_folders")
    .select("organization_id, client_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { organizationId: data.organization_id, clientId: data.client_id };
}
```

**Nota de corrección para el Step 1:** `select("id", { count: "exact", head: true })` con `head: true` NO devuelve filas (`data` siempre es `null` con `head: true`) — usar `existing?.length` ahí es un bug. Reemplazar `createProjectFolder` por esta versión antes de continuar:

```typescript
export async function createProjectFolder(
  db: Db,
  input: { organizationId: string; clientId: string; name: string; color: string; createdBy: string },
): Promise<ProjectFolderRow> {
  const { count, error: countError } = await db
    .from("project_folders")
    .select("*", { count: "exact", head: true })
    .eq("client_id", input.clientId);
  if (countError) throw countError;
  const { data, error } = await db
    .from("project_folders")
    .insert({
      organization_id: input.organizationId,
      client_id: input.clientId,
      name: input.name.trim(),
      color: input.color,
      sort_order: count ?? 0,
      created_by: input.createdBy,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}
```

- [ ] **Step 2: Agregar `setProjectFolder` a `work-items.ts`**

Al final de `packages/db/src/repositories/work-items.ts`, agregar:

```typescript
/** Mueve un proyecto a otra carpeta (o a "Sin carpeta" con `folderId: null`) —
 * lo dispara el onDrop de <ProjectsByFolder>. */
export async function setProjectFolder(
  db: Db,
  projectId: string,
  folderId: string | null,
): Promise<void> {
  const { error } = await db.from("work_items").update({ folder_id: folderId }).eq("id", projectId);
  if (error) throw error;
}
```

- [ ] **Step 3: Exportar el repositorio nuevo**

Modificar `packages/db/src/index.ts` — agregar (junto a las demás de `work-items`):

```typescript
export * from "./repositories/project-folders";
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: éxito. Si falla por el tipo de `ProjectFolderRow`/columnas de `work_items` no reconocidas, confirmar que la Tarea 1 (regenerar tipos) se completó antes de esta.

- [ ] **Step 5: Commit**

```bash
git add packages/db/src/repositories/project-folders.ts packages/db/src/repositories/work-items.ts packages/db/src/index.ts
git commit -m "feat(db): CRUD de carpetas de proyecto + mover un proyecto de carpeta"
```

---

## Task 4: Guard local + helper de ruta para las acciones

**Files:**
- Create: `apps/web/lib/project-folder-actions.ts` (se completa en la Task 5 — este paso solo deja el guard y el helper de validación de cliente)

**Interfaces:**
- Consumes: `getCurrentUser`/`hasPermission` de `@/lib/auth`; `getSupabaseServerClient`; `clientHref` de `@/lib/project-paths`.
- Produces: helpers privados usados por el resto del archivo en la Task 5 (no se exportan fuera del archivo).

- [ ] **Step 1: Crear el archivo con el guard y el helper de cliente**

Crear `apps/web/lib/project-folder-actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import {
  createProjectFolder,
  deleteProjectFolder,
  getProjectFolderOrg,
  reorderProjectFolders,
  setProjectFolder,
  updateProjectFolder,
} from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { clientHref } from "@/lib/project-paths";

export type ActionResult = { ok: true; error?: never } | { ok?: never; error: string };
export type IdResult = { id: string; error?: never } | { id?: never; error: string };

type ManagerAuth =
  | { organizationId: string; userId: string; error?: never }
  | { organizationId?: never; userId?: never; error: string };

// Mismo guard que ya existe (privado) en project-actions.ts — se duplica aquí
// a propósito, siguiendo el patrón ya establecido en el proyecto de que estos
// archivos de acciones no comparten guards triviales entre sí (ver
// access-actions.ts/mi-area-actions.ts/proyectos-access-actions.ts).
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

/** Confirma que el cliente pertenece a la organización y devuelve su `name`
 * (hace falta para `clientHref` al revalidar la ruta del cliente). */
async function assertClientInOrg(
  db: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  clientId: string,
  organizationId: string,
): Promise<{ name: string } | null> {
  const { data, error } = await db
    .from("clients")
    .select("organization_id, name")
    .eq("id", clientId)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.organization_id !== organizationId) return null;
  return { name: data.name };
}
```

- [ ] **Step 2: Typecheck (parcial, el archivo aún no exporta ninguna server action)**

Run: `pnpm --filter @agency-os/web typecheck`
Expected: puede fallar con "el archivo no tiene exports" o similar si Next.js exige al menos una función async exportada en un módulo `"use server"` — si falla por eso, es esperado y se resuelve en la Task 5 (donde se agregan las acciones reales al mismo archivo). Si falla por otra razón (tipos, imports), corregir antes de continuar.

---

## Task 5: Server actions completas del módulo de carpetas

**Files:**
- Modify: `apps/web/lib/project-folder-actions.ts` (agregar las 5 acciones exportadas al final del archivo de la Task 4)

**Interfaces:**
- Consumes: todo lo de la Task 4 (mismo archivo) + los repos de la Task 3.
- Produces: `createProjectFolderAction`, `updateProjectFolderAction`, `deleteProjectFolderAction`, `reorderProjectFoldersAction`, `setProjectFolderAction` — los usa `apps/web/components/proyectos/projects-by-folder.tsx` (Task 6).

- [ ] **Step 1: Agregar las acciones**

Al final de `apps/web/lib/project-folder-actions.ts`, agregar:

```typescript
export interface ProjectFolderInput {
  name: string;
  color: string;
}

export async function createProjectFolderAction(
  clientId: string,
  input: ProjectFolderInput,
): Promise<IdResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (!input.name.trim()) return { error: "El nombre de la carpeta es obligatorio." };

  try {
    const db = await getSupabaseServerClient();
    const client = await assertClientInOrg(db, clientId, auth.organizationId);
    if (!client) return { error: "El cliente no existe o no pertenece a tu organización." };

    const folder = await createProjectFolder(db, {
      organizationId: auth.organizationId,
      clientId,
      name: input.name,
      color: input.color,
      createdBy: auth.userId,
    });
    revalidatePath(clientHref({ id: clientId, name: client.name }));
    return { id: folder.id };
  } catch (error) {
    console.error("createProjectFolderAction", error);
    return { error: "No se pudo crear la carpeta. Intenta de nuevo." };
  }
}

export async function updateProjectFolderAction(
  folderId: string,
  input: ProjectFolderInput,
): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (!input.name.trim()) return { error: "El nombre de la carpeta es obligatorio." };

  try {
    const db = await getSupabaseServerClient();
    const folder = await getProjectFolderOrg(db, folderId);
    if (!folder || folder.organizationId !== auth.organizationId) {
      return { error: "La carpeta no existe o no pertenece a tu organización." };
    }
    const client = await assertClientInOrg(db, folder.clientId, auth.organizationId);
    if (!client) return { error: "El cliente no existe o no pertenece a tu organización." };

    await updateProjectFolder(db, folderId, input);
    revalidatePath(clientHref({ id: folder.clientId, name: client.name }));
    return { ok: true };
  } catch (error) {
    console.error("updateProjectFolderAction", error);
    return { error: "No se pudo actualizar la carpeta. Intenta de nuevo." };
  }
}

export async function deleteProjectFolderAction(folderId: string): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    const folder = await getProjectFolderOrg(db, folderId);
    if (!folder || folder.organizationId !== auth.organizationId) {
      return { error: "La carpeta no existe o no pertenece a tu organización." };
    }
    const client = await assertClientInOrg(db, folder.clientId, auth.organizationId);

    await deleteProjectFolder(db, folderId);
    if (client) revalidatePath(clientHref({ id: folder.clientId, name: client.name }));
    return { ok: true };
  } catch (error) {
    console.error("deleteProjectFolderAction", error);
    return { error: "No se pudo eliminar la carpeta. Intenta de nuevo." };
  }
}

/** `orderedIds` debe ser la lista completa de carpetas del cliente, en el
 * nuevo orden — mismo contrato que `reorderProjectStatuses`. */
export async function reorderProjectFoldersAction(
  clientId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (orderedIds.length === 0) return { ok: true };

  try {
    const db = await getSupabaseServerClient();
    const client = await assertClientInOrg(db, clientId, auth.organizationId);
    if (!client) return { error: "El cliente no existe o no pertenece a tu organización." };

    // Defensa en profundidad: todas las carpetas deben ser de este cliente/organización.
    const { data, error } = await db
      .from("project_folders")
      .select("id, organization_id, client_id")
      .in("id", orderedIds);
    if (error) throw error;
    const rows = data ?? [];
    if (
      rows.length !== orderedIds.length ||
      rows.some((r) => r.organization_id !== auth.organizationId || r.client_id !== clientId)
    ) {
      return { error: "Las carpetas no pertenecen a este cliente." };
    }

    await reorderProjectFolders(db, orderedIds);
    revalidatePath(clientHref({ id: clientId, name: client.name }));
    return { ok: true };
  } catch (error) {
    console.error("reorderProjectFoldersAction", error);
    return { error: "No se pudo reordenar. Intenta de nuevo." };
  }
}

/** `folderId: null` mueve el proyecto a "Sin carpeta". */
export async function setProjectFolderAction(
  projectId: string,
  folderId: string | null,
): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();

    const { data: project, error: projectError } = await db
      .from("work_items")
      .select("organization_id, client:clients(id, name)")
      .eq("id", projectId)
      .eq("type", "project")
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project || project.organization_id !== auth.organizationId) {
      return { error: "El proyecto no existe o no pertenece a tu organización." };
    }

    if (folderId) {
      const folder = await getProjectFolderOrg(db, folderId);
      if (!folder || folder.organizationId !== auth.organizationId) {
        return { error: "La carpeta no existe o no pertenece a tu organización." };
      }
    }

    await setProjectFolder(db, projectId, folderId);
    const client = project.client as unknown as { id: string; name: string } | null;
    if (client) revalidatePath(clientHref(client));
    return { ok: true };
  } catch (error) {
    console.error("setProjectFolderAction", error);
    return { error: "No se pudo mover el proyecto. Intenta de nuevo." };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @agency-os/web typecheck`
Expected: éxito.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/project-folder-actions.ts
git commit -m "feat(proyectos): server actions de carpetas (crear, editar, borrar, mover proyecto)"
```

---

## Task 6: Componente `ProjectsByFolder` (secciones + drag&drop + modales)

**Files:**
- Create: `apps/web/components/proyectos/projects-by-folder.tsx`

**Interfaces:**
- Consumes: `groupProjectsByFolder` de `@agency-os/domain`; las 5 server actions de la Task 5; `Badge`, `Button`, `Input`, `Label`, `Modal`, `readableTextOn` de `@agency-os/ui`; `projectHref` de `@/lib/project-paths`.
- Produces: `<ProjectsByFolder client folders rows canManage />` — lo usa `apps/web/app/(app)/proyectos/[cliente]/page.tsx` (Task 7).

- [ ] **Step 1: Crear el componente**

Crear `apps/web/components/proyectos/projects-by-folder.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { groupProjectsByFolder } from "@agency-os/domain";
import { Badge, Button, Input, Label, Modal, readableTextOn } from "@agency-os/ui";
import {
  createProjectFolderAction,
  deleteProjectFolderAction,
  setProjectFolderAction,
  updateProjectFolderAction,
  type ProjectFolderInput,
} from "@/lib/project-folder-actions";
import { projectHref } from "@/lib/project-paths";

export interface ProjectFolderView {
  id: string;
  name: string;
  color: string;
  sortOrder: number;
}

export interface FolderProjectRow {
  id: string;
  title: string;
  folderId: string | null;
  tasksCount: number;
  progress: number;
  projectState: "active" | "completed" | "archived";
}

/** Misma paleta que project-status-manager.tsx (estados del tablero) — Hexes
 * legibles en ambos temas. Duplicada a propósito: es un array trivial, no
 * amerita compartir un módulo solo por esto (mismo criterio que otros
 * pequeños duplicados ya establecidos en el proyecto). */
const SWATCHES = [
  "#9aa1ab",
  "#7eb8ff",
  "#f5c95a",
  "#8b5cf6",
  "#86c99a",
  "#e5675f",
  "#3bc9c9",
  "#1f8f4d",
  "#e879b9",
  "#f59e42",
];

const STATE_BADGE: Record<FolderProjectRow["projectState"], { label: string; tone: "success" | "info" | "neutral" }> = {
  active: { label: "Activo", tone: "info" },
  completed: { label: "Completado", tone: "success" },
  archived: { label: "Archivado", tone: "neutral" },
};

type Editing = null | "new" | ProjectFolderView;

export function ProjectsByFolder({
  client,
  folders,
  rows,
  canManage,
}: {
  /** `{id, name}` del cliente — projectHref() necesita el NOMBRE real (no un
   * slug ya armado) para construir el link de cada proyecto, igual que ya
   * hace new-project-modal.tsx. */
  client: { id: string; name: string };
  folders: ProjectFolderView[];
  rows: FolderProjectRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [dragId, setDragId] = useState<string | null>(null);
  const [overFolderId, setOverFolderId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [deleting, setDeleting] = useState<ProjectFolderView | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#7eb8ff");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const groups = groupProjectsByFolder(folders, rows);

  const openModal = (target: Exclude<Editing, null>) => {
    setEditing(target);
    setError(null);
    if (target === "new") {
      setName("");
      setColor("#7eb8ff");
    } else {
      setName(target.name);
      setColor(target.color);
    }
  };

  const submitFolder = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const input: ProjectFolderInput = { name: trimmed, color };
    startTransition(async () => {
      const result =
        editing === "new"
          ? await createProjectFolderAction(client.id, input)
          : editing
            ? await updateProjectFolderAction(editing.id, input)
            : { error: "Sin selección." };
      if (result.error) {
        setError(result.error);
        return;
      }
      setEditing(null);
      router.refresh();
    });
  };

  const confirmDeleteFolder = () => {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteProjectFolderAction(deleting.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      setDeleting(null);
      router.refresh();
    });
  };

  const dropOnFolder = (folderId: string | null) => {
    if (!canManage || !dragId) return;
    setOverFolderId(null);
    const projectId = dragId;
    setDragId(null);
    startTransition(async () => {
      const result = await setProjectFolderAction(projectId, folderId);
      if (result.error) setError(result.error);
      else router.refresh();
    });
  };

  return (
    <div>
      {canManage && (
        <div className="mb-4 flex justify-end">
          <Button variant="outline" size="sm" onClick={() => openModal("new")}>
            + Nueva carpeta
          </Button>
        </div>
      )}

      {error && !editing && !deleting && (
        <div className="mb-4 rounded-md border border-danger/40 bg-glass px-4 py-2 text-sm text-danger backdrop-blur-xl">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {groups.map((group) => {
          const key = group.folder?.id ?? "sin-carpeta";
          if (!group.folder && group.projects.length === 0 && folders.length > 0) {
            // "Sin carpeta" vacío: no vale la pena mostrar la sección si ya
            // hay carpetas y no queda ningún proyecto suelto.
            return null;
          }
          return (
            <div
              key={key}
              onDragOver={(e) => {
                if (!canManage || !dragId) return;
                e.preventDefault();
                setOverFolderId(key);
              }}
              onDragLeave={() => setOverFolderId((f) => (f === key ? null : f))}
              onDrop={() => dropOnFolder(group.folder?.id ?? null)}
              className={`rounded-lg border p-4 transition ${
                overFolderId === key ? "border-green" : "border-line"
              }`}
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  {group.folder ? (
                    <Badge color={group.folder.color}>{group.folder.name}</Badge>
                  ) : (
                    <Badge tone="neutral">Sin carpeta</Badge>
                  )}
                  <span className="font-mono text-xs font-bold text-muted">
                    {group.projects.length}
                  </span>
                </div>
                {canManage && group.folder && (
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => openModal(group.folder!)}>
                      Editar
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => {
                        setError(null);
                        setDeleting(group.folder);
                      }}
                    >
                      Eliminar
                    </Button>
                  </div>
                )}
              </div>

              {group.projects.length === 0 ? (
                <p className="text-sm text-muted">
                  {group.folder ? "Arrastra un proyecto aquí." : "Sin proyectos sueltos."}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {group.projects.map((project) => {
                    const state = STATE_BADGE[project.projectState];
                    return (
                      <Link
                        key={project.id}
                        href={projectHref(client, project)}
                        draggable={canManage}
                        onDragStart={(e) => {
                          if (!canManage) return;
                          e.preventDefault();
                          setDragId(project.id);
                        }}
                        onDragEnd={() => {
                          setDragId(null);
                          setOverFolderId(null);
                        }}
                        className={`rounded-md border border-line bg-glass p-3 backdrop-blur-xl transition hover:border-line-strong ${
                          canManage ? "cursor-grab active:cursor-grabbing" : ""
                        } ${dragId === project.id ? "opacity-50" : ""}`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-semibold text-ink">{project.title}</span>
                          <Badge tone={state.tone}>{state.label}</Badge>
                        </div>
                        <div className="mt-2 flex items-center justify-between text-xs text-muted">
                          <span>{project.tasksCount} tareas</span>
                          <span>{project.progress}%</span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <Modal
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editing === "new" ? "Nueva carpeta" : "Editar carpeta"}
        footer={
          <>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button onClick={submitFolder} disabled={pending || !name.trim()}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div>
            <Label htmlFor="folder-name">Nombre</Label>
            <Input
              id="folder-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej. Área Contenidos"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="folder-color">Color</Label>
            <div className="flex items-center gap-3">
              <input
                id="folder-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-12 cursor-pointer rounded-md border border-line bg-transparent"
              />
              <div className="flex flex-wrap gap-1.5">
                {SWATCHES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    aria-label={s}
                    onClick={() => setColor(s)}
                    className={`h-6 w-6 rounded-pill border transition ${
                      color.toLowerCase() === s.toLowerCase() ? "border-ink" : "border-line-strong"
                    }`}
                    style={{ background: s }}
                  />
                ))}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-md border border-line bg-glass p-3 backdrop-blur-xl">
            <span className="text-xs text-muted">Vista previa:</span>
            <Badge color={color}>{name.trim() || "Carpeta"}</Badge>
          </div>
          {readableTextOn(color) === "#0d0f08" && (
            <p className="text-xs text-warn">
              Color claro: en tema claro el texto puede tener bajo contraste.
            </p>
          )}
          {error && <p className="text-sm text-danger">{error}</p>}
        </div>
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Eliminar carpeta"
        description={
          deleting
            ? `Se eliminará la carpeta "${deleting.name}". Sus proyectos quedarán en "Sin carpeta".`
            : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={confirmDeleteFolder} disabled={pending}>
              {pending ? "Eliminando…" : "Eliminar"}
            </Button>
          </>
        }
      >
        {error && deleting && <p className="text-sm text-danger">{error}</p>}
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @agency-os/web typecheck`
Expected: puede fallar si `Link` no acepta `draggable`/`onDragStart` (los `<a>` renderizados por `next/link` sí aceptan atributos HTML nativos vía props pass-through, pero si el typecheck se queja, cambiar el `<Link>` por un `<div onClick={() => router.push(href)}>` envolviendo el contenido, o separar el drag-handle del área clickeable — ajustar sin cambiar el comportamiento descrito). Si falla por `Badge`/`Modal`/`Input`/`Label`/`Button`/`readableTextOn`, ajustar a los props reales (mismo criterio que en tareas anteriores: no se listan aquí todas las firmas exactas de UI, ya se usaron exitosamente en archivos existentes del proyecto).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/proyectos/projects-by-folder.tsx
git commit -m "feat(proyectos): componente de carpetas con drag&drop y modales"
```

---

## Task 7: Cablear en `/proyectos/[cliente]`

**Files:**
- Modify: `apps/web/app/(app)/proyectos/[cliente]/page.tsx`

**Interfaces:**
- Consumes: `listProjectFolders` de `@agency-os/db` (Task 3); `ProjectsByFolder` (Task 6).
- Produces: página completa — no lo consume ninguna otra tarea.

- [ ] **Step 1: Agregar el fetch de carpetas y el render condicional**

En `apps/web/app/(app)/proyectos/[cliente]/page.tsx`:

1. Agregar el import:

```typescript
import { listProjectFolders } from "@agency-os/db";
import { ProjectsByFolder, type FolderProjectRow, type ProjectFolderView } from "@/components/proyectos/projects-by-folder";
```

2. Incluir `listProjectFolders(db, client.id)` en el `Promise.all` que ya trae `projects`/`allClientProjectsIfSearch` (agregar como tercer elemento del array, o en un `Promise.all` aparte inmediatamente después — cualquiera de las dos formas es correcta, elegir la que quede más legible en el diff real).

3. Después de construir `rows: ProjectListRow[]` (ya existente, sin tocarlo), agregar la construcción paralela para el componente nuevo:

```typescript
const folderViews: ProjectFolderView[] = folders.map((f) => ({
  id: f.id,
  name: f.name,
  color: f.color,
  sortOrder: f.sort_order,
}));

const folderRows: FolderProjectRow[] = projects.map((p) => ({
  id: p.id,
  title: p.title,
  folderId: p.folder_id,
  tasksCount: p.tasks_count,
  progress: progressOf(p),
  projectState: p.project_state ?? "active",
}));
```

4. Reemplazar el `<ProjectsList ... />` final por el render condicional:

```tsx
{searchParams.q ? (
  <ProjectsList
    rows={rows}
    q={searchParams.q ?? ""}
    clients={allClients}
    defaultClient={defaultClient}
    canManage={hasPermission(user, "project.manage")}
    hideHeading
  />
) : (
  <ProjectsByFolder
    client={{ id: client.id, name: client.name }}
    folders={folderViews}
    rows={folderRows}
    canManage={hasPermission(user, "project.manage")}
  />
)}
```

(El botón "+ Nuevo proyecto" que trae `ProjectsList` deja de verse cuando no hay búsqueda, porque `ProjectsByFolder` no lo incluye — ver "Fuera de alcance" del spec: los proyectos nuevos se crean sin carpeta y se arrastran después. Si al probarlo esto resulta incómodo, es una mejora aparte, no bloquea este plan.)

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @agency-os/web typecheck`
Expected: éxito.

- [ ] **Step 3: Typecheck completo del monorepo**

Run: `pnpm typecheck`
Expected: los 6 paquetes en verde.

- [ ] **Step 4: Verificación manual (no hay tests de UI en este repo)**

Con el dev server corriendo, entrar a `/proyectos/[un-cliente-con-varios-proyectos]` con una cuenta `project.manage` y confirmar:
1. Sin buscar nada: se ven las secciones agrupadas (inicialmente todo bajo "Sin carpeta", porque no hay carpetas creadas todavía).
2. "+ Nueva carpeta" crea una carpeta con nombre y color elegido.
3. Arrastrar un proyecto desde "Sin carpeta" hacia la carpeta nueva → se mueve, el contador de cada sección se actualiza.
4. Arrastrar el mismo proyecto de vuelta a "Sin carpeta" → funciona igual en reversa.
5. "Editar" una carpeta cambia su nombre/color y se refleja de inmediato.
6. "Eliminar" una carpeta con un proyecto adentro → el proyecto reaparece en "Sin carpeta", no se pierde.
7. Escribir algo en el buscador del cliente → vuelve a verse la tabla plana de siempre (`ProjectsList`), sin agrupar.
8. Ir a `/proyectos` (vista global, sin cliente) y al dashboard → confirmar que se ven exactamente igual que antes (sin ningún cambio visual).

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(app)/proyectos/[cliente]/page.tsx"
git commit -m "feat(proyectos): agrupar proyectos por carpeta en el espacio del cliente"
```

---

## Self-Review (hecho al escribir este plan)

- **Cobertura de la spec:** tabla + RLS (Task 1) ✓, agrupación con "Sin carpeta" al final (Task 2) ✓, CRUD de carpetas + mover proyecto (Tasks 3, 5) ✓, drag&drop nativo replicando `project-board.tsx` (Task 6) ✓, selector de color replicando `project-status-manager.tsx` (Task 6) ✓, `ProjectsList` intacto y solo se reemplaza sin búsqueda activa (Task 7) ✓, borrado de carpeta no bloquea ni pierde proyectos (Tasks 1, 5) ✓.
- **Placeholder scan:** ninguno — cada paso tiene código completo. El único punto abierto explícito es el fallback de `<Link draggable>` en la Task 6 Step 2, documentado como una decisión a resolver EN el momento si el typecheck lo exige, con la alternativa ya indicada (no es un placeholder, es una bifurcación conocida de antemano).
- **Corrección aplicada durante la auto-revisión:** el primer borrador de `createProjectFolder` (Task 3) usaba `.select("id", { count: "exact", head: true })` y luego `existing?.length` para calcular `sort_order` — con `head: true` Postgrest NUNCA devuelve `data`, así que `existing` siempre sería `null` y `sort_order` quedaría siempre en `0`. Corregido en el mismo Step 1 de la Task 3 usando `count` (que sí viaja con `head: true`) en vez de `data?.length`.
- **Consistencia de tipos:** `ProjectFolderInput` (Task 5) se usa igual en `projects-by-folder.tsx` (Task 6). `FolderProjectRow`/`ProjectFolderView` (Task 6) son tipos NUEVOS y separados de `ProjectListRow` (`projects-list.tsx`) a propósito — no se comparten, para no tocar ese archivo.
