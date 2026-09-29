# Editor de Roles Configurable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar que un Administrador de sistema (`is_super`) cree roles nuevos y edite qué permisos tiene cada rol existente desde `/usuarios`, sin necesitar una migración SQL.

**Architecture:** Nueva pestaña "Roles" en la página `/usuarios` ya existente. Todas las escrituras (crear/editar/borrar rol, cambiar sus permisos) van con el cliente `service_role` desde server actions gateadas por `requireSuperAdmin()` — las tablas `roles`/`permissions`/`role_permissions` solo tienen políticas RLS de `select`, así que no hace falta ninguna migración. Los permisos se agrupan y muestran con su `name`/`description` ya legibles (columnas que ya existen), agrupados por una etiqueta fija por prefijo de código (`quote` → "Cotizaciones", etc.), resuelta por una función pura en `packages/domain` con sus propios tests.

**Tech Stack:** Next.js App Router (server actions + server components), Supabase (`service_role` client), React (client component con `useState`/`useTransition`), TypeScript, Vitest (solo para el paquete `domain`, que es el único con tests en este repo).

## Global Constraints

- Body de commits y comentarios de código en español (convención del proyecto, ver CLAUDE.md).
- No usar `git commit` sin que Yesid lo pida explícitamente — al terminar cada tarea, dejar el trabajo listo pero SIN commitear salvo que se indique lo contrario en la tarea.
- No renombrar archivos existentes.
- Todo repositorio de `packages/db` recibe el cliente (`Db`) como primer parámetro — nunca lo crea internamente (excepción ya establecida: `createSupabaseServiceRoleClient()` se llama solo desde `apps/web/lib/*.ts`, nunca desde `packages/db`).
- `roles.code` es `text not null unique` — se autogenera con `slugify()` (ya existe en `@agency-os/domain`) a partir del nombre; nunca se edita después de creado.
- El catálogo de **permisos** (`permissions`) es fijo — este editor solo compone roles a partir de permisos que ya existen, nunca crea/edita/borra un permiso.
- Verificación de cada tarea: `pnpm typecheck` debe pasar limpio (no hay infra de tests de UI/server-actions en este repo; solo `packages/domain` tiene Vitest).

---

## Task 1: Función de dominio para agrupar permisos

**Files:**
- Create: `packages/domain/src/permission-groups.ts`
- Create: `packages/domain/src/permission-groups.test.ts`
- Modify: `packages/domain/src/index.ts` (agregar `export * from "./permission-groups";` al final del archivo)

**Interfaces:**
- Consumes: nada (función pura, sin dependencias de otros paquetes).
- Produces: `groupLabel(code: string): string` y `groupPermissions<T extends { code: string }>(permissions: T[]): { label: string; items: T[] }[]` — los usa `apps/web/components/access/roles-manager.tsx` (Task 7).

- [ ] **Step 1: Escribir el test que falla**

Crear `packages/domain/src/permission-groups.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { groupLabel, groupPermissions } from "./permission-groups";

describe("groupLabel", () => {
  it("resuelve el prefijo de un código conocido a su etiqueta en español", () => {
    expect(groupLabel("quote.see_costs")).toBe("Cotizaciones");
    expect(groupLabel("quote_status.manage")).toBe("Estados de cotización");
    expect(groupLabel("project.manage")).toBe("Proyectos");
    expect(groupLabel("client.manage")).toBe("Clientes");
    expect(groupLabel("kam.manage")).toBe("KAM / PM");
    expect(groupLabel("people.manage")).toBe("Personas");
    expect(groupLabel("users.manage")).toBe("Usuarios y roles");
  });

  it("cae al prefijo capitalizado si no hay etiqueta mapeada", () => {
    expect(groupLabel("billing.manage")).toBe("Billing");
  });

  it("no revienta con un código sin punto", () => {
    expect(groupLabel("standalone")).toBe("Standalone");
  });
});

describe("groupPermissions", () => {
  it("agrupa por etiqueta y conserva los ítems de cada grupo", () => {
    const permissions = [
      { code: "quote.see_costs", name: "Ver costos" },
      { code: "project.manage", name: "Gestionar proyectos" },
      { code: "quote.send", name: "Enviar cotización" },
    ];
    const groups = groupPermissions(permissions);
    expect(groups).toEqual([
      { label: "Cotizaciones", items: [permissions[0], permissions[2]] },
      { label: "Proyectos", items: [permissions[1]] },
    ]);
  });

  it("ordena los grupos alfabéticamente por etiqueta", () => {
    const permissions = [
      { code: "users.manage", name: "Gestionar usuarios" },
      { code: "client.manage", name: "Gestionar clientes" },
    ];
    const groups = groupPermissions(permissions);
    expect(groups.map((g) => g.label)).toEqual(["Clientes", "Usuarios y roles"]);
  });

  it("devuelve una lista vacía si no hay permisos", () => {
    expect(groupPermissions([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr el test para confirmar que falla**

Run: `pnpm --filter @agency-os/domain test -- permission-groups`
Expected: FAIL — `Cannot find module './permission-groups'` (el archivo de implementación no existe todavía).

- [ ] **Step 3: Implementación mínima**

Crear `packages/domain/src/permission-groups.ts`:

```typescript
// Etiqueta en español para el prefijo (antes del primer punto) de un
// `permissions.code` — ej. "quote.see_costs" → prefijo "quote" → "Cotizaciones".
// Si aparece un prefijo nuevo (permiso agregado por una migración futura sin
// actualizar este mapa), cae a mostrar el prefijo capitalizado — nunca rompe
// la UI del editor de roles por un permiso sin mapear.
const GROUP_LABELS: Record<string, string> = {
  quote: "Cotizaciones",
  quote_status: "Estados de cotización",
  project: "Proyectos",
  client: "Clientes",
  kam: "KAM / PM",
  people: "Personas",
  users: "Usuarios y roles",
};

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function groupLabel(code: string): string {
  const prefix = code.split(".")[0] ?? code;
  return GROUP_LABELS[prefix] ?? capitalize(prefix);
}

/** Agrupa permisos por `groupLabel(code)`, en orden alfabético de etiqueta.
 * Conserva el orden relativo de los permisos dentro de cada grupo. */
export function groupPermissions<T extends { code: string }>(
  permissions: T[],
): { label: string; items: T[] }[] {
  const byLabel = new Map<string, T[]>();
  for (const permission of permissions) {
    const label = groupLabel(permission.code);
    const list = byLabel.get(label);
    if (list) list.push(permission);
    else byLabel.set(label, [permission]);
  }
  return [...byLabel.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, items]) => ({ label, items }));
}
```

- [ ] **Step 4: Correr el test para confirmar que pasa**

Run: `pnpm --filter @agency-os/domain test -- permission-groups`
Expected: PASS — 6 tests en verde.

- [ ] **Step 5: Exportarlo desde el índice del paquete**

Modificar `packages/domain/src/index.ts` — agregar al final:

```typescript
export * from "./permission-groups";
```

- [ ] **Step 6: Typecheck del paquete**

Run: `pnpm --filter @agency-os/domain typecheck`
Expected: éxito, sin errores.

- [ ] **Step 7: Commit**

```bash
git add packages/domain/src/permission-groups.ts packages/domain/src/permission-groups.test.ts packages/domain/src/index.ts
git commit -m "feat(domain): agrupar permisos por etiqueta legible para el editor de roles"
```

---

## Task 2: Repositorio de permisos

**Files:**
- Create: `packages/db/src/repositories/permissions.ts`
- Modify: `packages/db/src/index.ts` (agregar `export * from "./repositories/permissions";`)

**Interfaces:**
- Consumes: `Db` de `./shared` (patrón ya usado en todo `packages/db`).
- Produces: `PermissionRow` (tipo) y `listPermissions(db: Db): Promise<PermissionRow[]>` — los usa `apps/web/app/(app)/(hub)/usuarios/page.tsx` (Task 8).

- [ ] **Step 1: Crear el repositorio**

Crear `packages/db/src/repositories/permissions.ts`:

```typescript
import type { Tables } from "../types/database";
import type { Db } from "./shared";

export type PermissionRow = Tables<"permissions">;

/** Catálogo completo de permisos (fijo, se mantiene por migración) — el
 * editor de roles solo lee de aquí para armar los checkboxes por rol. */
export async function listPermissions(db: Db): Promise<PermissionRow[]> {
  const { data, error } = await db.from("permissions").select("*").order("code");
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 2: Exportarlo desde el índice del paquete**

Modificar `packages/db/src/index.ts` — agregar la línea (después de `export * from "./repositories/roles";`, para mantener el orden temático con `roles`):

```typescript
export * from "./repositories/permissions";
```

- [ ] **Step 3: Typecheck del paquete**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: éxito, sin errores.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/repositories/permissions.ts packages/db/src/index.ts
git commit -m "feat(db): repositorio de solo-lectura para el catálogo de permisos"
```

---

## Task 3: Extender el repositorio de roles

**Files:**
- Modify: `packages/db/src/repositories/roles.ts`

**Interfaces:**
- Consumes: `Db`, `Tables<"roles">`, `TablesInsert<"roles">`, `TablesUpdate<"roles">` (ya disponibles en `../types/database`); `slugify` de `@agency-os/domain` (paquete ya es dependencia de `@agency-os/db` — confirmar en `package.json`, ver Step 0).
- Produces (usados por `apps/web/lib/roles-actions.ts`, Task 5, y `apps/web/app/(app)/(hub)/usuarios/page.tsx`, Task 8):
  - `listAllRoles(db: Db): Promise<RoleRow[]>`
  - `listRolePermissionPairs(db: Db): Promise<{ role_id: string; permission_id: string }[]>`
  - `createRole(db: Db, input: { name: string; moduleCode: string | null; isSuper: boolean }): Promise<RoleRow>`
  - `updateRole(db: Db, roleId: string, input: { name: string; moduleCode: string | null; isSuper: boolean }): Promise<RoleRow>`
  - `deleteRole(db: Db, roleId: string): Promise<void>`
  - `countUsersWithRole(db: Db, roleId: string): Promise<number>`
  - `countOtherSuperRolesForUser(db: Db, userId: string, excludingRoleId: string): Promise<number>`
  - `setRolePermissions(db: Db, roleId: string, permissionIds: string[]): Promise<void>`

- [ ] **Step 0: Agregar `@agency-os/domain` como dependencia de `@agency-os/db`**

Confirmado: `packages/db/package.json` NO tiene `@agency-os/domain` como dependencia hoy (ningún repo de `packages/db/src` lo importa todavía), así que `import { slugify } from "@agency-os/domain"` del Step 2 no resolvería sin este paso.

En `packages/db/package.json`, agregar la línea a `"dependencies"` (junto a `@supabase/ssr` y `@supabase/supabase-js`):

```json
"dependencies": {
  "@agency-os/domain": "workspace:*",
  "@supabase/ssr": "^0.12.3",
  "@supabase/supabase-js": "^2.47.10"
},
```

Luego correr, desde la raíz del repo:

Run: `pnpm install`
Expected: reescribe `pnpm-lock.yaml` (enlaza el workspace), sin errores.

- [ ] **Step 2: Extender el archivo**

Reemplazar el contenido completo de `packages/db/src/repositories/roles.ts`:

```typescript
import { slugify } from "@agency-os/domain";
import type { Tables } from "../types/database";
import type { Db } from "./shared";

export type RoleRow = Tables<"roles">;

/** Roles asignables desde la sección general de Usuarios: los de sistema
 * (is_super, ej. Administrador) y los de cada módulo. Excluye los roles-persona
 * legacy (ni super ni de módulo) que no dan acceso a nada hoy. */
export async function listAssignableRoles(db: Db): Promise<RoleRow[]> {
  const { data, error } = await db
    .from("roles")
    .select("*")
    .or("is_super.eq.true,module_code.not.is.null")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/** Roles delegables de un módulo específico (ej. 'proyectos'), para la página de
 * gestión de accesos propia del módulo. Nunca incluye roles is_super. */
export async function listRolesByModule(db: Db, moduleCode: string): Promise<RoleRow[]> {
  const { data, error } = await db
    .from("roles")
    .select("*")
    .eq("module_code", moduleCode)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/** TODOS los roles, sin el filtro de `listAssignableRoles` — el editor de roles
 * necesita ver también los "huérfanos" (sin módulo y sin is_super) para poder
 * arreglarlos, cosa que la lista de asignación no necesita. */
export async function listAllRoles(db: Db): Promise<RoleRow[]> {
  const { data, error } = await db.from("roles").select("*").order("name");
  if (error) throw error;
  return data ?? [];
}

/** Todas las filas de `role_permissions` — el caller (server component de
 * /usuarios) las agrupa por `role_id` para no hacer una consulta por rol. */
export async function listRolePermissionPairs(
  db: Db,
): Promise<{ role_id: string; permission_id: string }[]> {
  const { data, error } = await db.from("role_permissions").select("role_id, permission_id");
  if (error) throw error;
  return data ?? [];
}

export interface RoleInput {
  name: string;
  moduleCode: string | null;
  isSuper: boolean;
}

/** Crea un rol nuevo. `code` se autogenera del nombre (slug) — no es editable
 * después de creado. Si el slug ya existe como código de otro rol, el `unique`
 * de la tabla lo rechaza y el caller (server action) lo traduce a un mensaje
 * legible (ver 23505 en apps/web/lib/roles-actions.ts). */
export async function createRole(db: Db, input: RoleInput): Promise<RoleRow> {
  const { data, error } = await db
    .from("roles")
    .insert({
      code: slugify(input.name),
      name: input.name.trim(),
      module_code: input.moduleCode,
      is_super: input.isSuper,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** Edita nombre/módulo/`is_super` de un rol existente. `code` nunca se toca. */
export async function updateRole(db: Db, roleId: string, input: RoleInput): Promise<RoleRow> {
  const { data, error } = await db
    .from("roles")
    .update({
      name: input.name.trim(),
      module_code: input.moduleCode,
      is_super: input.isSuper,
    })
    .eq("id", roleId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteRole(db: Db, roleId: string): Promise<void> {
  const { error } = await db.from("roles").delete().eq("id", roleId);
  if (error) throw error;
}

/** Cuántos usuarios tienen este rol asignado hoy — usado para bloquear el
 * borrado de un rol en uso (ver deleteRoleAction). */
export async function countUsersWithRole(db: Db, roleId: string): Promise<number> {
  const { count, error } = await db
    .from("user_roles")
    .select("*", { count: "exact", head: true })
    .eq("role_id", roleId);
  if (error) throw error;
  return count ?? 0;
}

/** Cuántos roles `is_super = true` DISTINTOS de `excludingRoleId` tiene
 * asignados este usuario — si da 0, quitarle is_super a `excludingRoleId` lo
 * dejaría sin ningún acceso de superadmin (ver updateRoleAction). */
export async function countOtherSuperRolesForUser(
  db: Db,
  userId: string,
  excludingRoleId: string,
): Promise<number> {
  const { count, error } = await db
    .from("user_roles")
    .select("role_id, roles!inner(is_super)", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("roles.is_super", true)
    .neq("role_id", excludingRoleId);
  if (error) throw error;
  return count ?? 0;
}

/** Reemplaza el set completo de permisos de un rol (borra + inserta) — mismo
 * patrón simple ya usado en el proyecto para "replace" de listas completas
 * (ver replaceQuoteItems). No hace falta el cuidado de concurrencia de
 * cotizaciones: editar los permisos de UN rol no lo hacen 10 personas a la
 * vez en la práctica. */
export async function setRolePermissions(
  db: Db,
  roleId: string,
  permissionIds: string[],
): Promise<void> {
  const { error: deleteError } = await db.from("role_permissions").delete().eq("role_id", roleId);
  if (deleteError) throw deleteError;
  if (permissionIds.length === 0) return;
  const { error: insertError } = await db
    .from("role_permissions")
    .insert(permissionIds.map((permission_id) => ({ role_id: roleId, permission_id })));
  if (insertError) throw insertError;
}
```

- [ ] **Step 3: Typecheck del paquete**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: éxito. Si `countOtherSuperRolesForUser` da un error de tipos en el `select` con join (`roles!inner(is_super)`), revisar que el nombre de la tabla referenciada en el string coincida exactamente con `public.roles` tal como la ve el cliente tipado (Supabase infiere el nombre de la relación del FK `user_roles.role_id → roles.id`); si el tipo generado no reconoce el join embebido con filtro, alternativa equivalente sin join:

```typescript
export async function countOtherSuperRolesForUser(
  db: Db,
  userId: string,
  excludingRoleId: string,
): Promise<number> {
  const { data, error } = await db
    .from("user_roles")
    .select("role_id, roles(is_super)")
    .eq("user_id", userId)
    .neq("role_id", excludingRoleId);
  if (error) throw error;
  return (data ?? []).filter((row) => (row.roles as { is_super: boolean } | null)?.is_super).length;
}
```

Usar la primera versión si el typecheck pasa; si no, usar esta segunda (trae las filas y filtra en JS — mismo resultado, menos elegante pero sin depender de sintaxis de filtro sobre join embebido de PostgREST).

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/repositories/roles.ts
git commit -m "feat(db): CRUD de roles + gestión de sus permisos para el editor de roles"
```

---

## Task 4: Compartir el guard de superadmin

**Files:**
- Create: `apps/web/lib/access-guard.ts`
- Modify: `apps/web/lib/access-actions.ts:1-29` (quitar la definición local de `requireSuperAdmin`, importarla)

**Interfaces:**
- Consumes: `getCurrentUser` de `@/lib/auth`.
- Produces: `requireSuperAdmin(): Promise<{ organizationId: string; error?: never } | { organizationId?: never; error: string }>` — lo usa `apps/web/lib/access-actions.ts` (ya, tras esta tarea) y `apps/web/lib/roles-actions.ts` (Task 5).

- [ ] **Step 1: Crear el guard compartido**

Crear `apps/web/lib/access-guard.ts` con EXACTAMENTE el contenido que hoy vive al inicio de `access-actions.ts`:

```typescript
import { getCurrentUser } from "@/lib/auth";

// Asignar accesos y crear usuarios/roles es exclusivo del Administrador de
// sistema (is_super) — no del permiso puntual users.manage, que hoy también
// podría tener un admin de un módulo (ej. CRM) sin que eso le dé control
// global. Compartido entre access-actions.ts y roles-actions.ts.
export async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." } as const;
  if (!user.isSuper) {
    return { error: "Solo un Administrador de sistema puede gestionar accesos." } as const;
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." } as const;
  return { organizationId } as const;
}
```

- [ ] **Step 2: Quitar la definición local de `access-actions.ts` y usar la compartida**

En `apps/web/lib/access-actions.ts`, reemplazar:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import {
  createArea,
  createSupabaseServiceRoleClient,
  grantUserRole,
  revokeUserRole,
  updateAreaManager,
} from "@agency-os/db";
import { isAllowedEmailDomain } from "@agency-os/domain";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type AccessActionResult = { ok: true; error?: never } | { ok?: never; error: string };

// Asignar accesos y crear usuarios es exclusivo del Administrador de sistema
// (is_super) — no del permiso puntual users.manage, que hoy también podría
// tener un admin de un módulo (ej. CRM) sin que eso le dé control global.
async function requireSuperAdmin() {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." } as const;
  if (!user.isSuper) {
    return { error: "Solo un Administrador de sistema puede gestionar accesos." } as const;
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." } as const;
  return { organizationId } as const;
}
```

por:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import {
  createArea,
  createSupabaseServiceRoleClient,
  grantUserRole,
  revokeUserRole,
  updateAreaManager,
} from "@agency-os/db";
import { isAllowedEmailDomain } from "@agency-os/domain";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { requireSuperAdmin } from "@/lib/access-guard";

export type AccessActionResult = { ok: true; error?: never } | { ok?: never; error: string };
```

El resto del archivo (`grantRole`, `revokeRole`, `deleteUser`, `inviteUser`, `createAreaAction`, `updateAreaManagerAction`, `assignPersonAreaAction`) queda IGUAL — todas ya llaman a `requireSuperAdmin()` como función libre, y ahora resuelve al import en vez de a la definición local.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @agency-os/web typecheck`
Expected: éxito. `deleteUser` sigue usando `getCurrentUser()` directo (no `requireSuperAdmin()`) porque necesita bloquear la auto-eliminación con `current.id`, no solo el chequeo de `isSuper` — no tocar esa función.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/access-guard.ts apps/web/lib/access-actions.ts
git commit -m "refactor(usuarios): extraer requireSuperAdmin a un guard compartido"
```

---

## Task 5: Server actions del editor de roles

**Files:**
- Create: `apps/web/lib/roles-actions.ts`

**Interfaces:**
- Consumes: `requireSuperAdmin` de `@/lib/access-guard` (Task 4); `createRole`, `updateRole`, `deleteRole`, `countUsersWithRole`, `countOtherSuperRolesForUser`, `setRolePermissions` de `@agency-os/db` (Task 3); `createSupabaseServiceRoleClient` de `@agency-os/db`; `getCurrentUser` de `@/lib/auth`.
- Produces: `createRoleAction`, `updateRoleAction`, `deleteRoleAction`, `setRolePermissionsAction` — los usa `apps/web/components/access/roles-manager.tsx` (Task 7).

- [ ] **Step 1: Crear el archivo de acciones**

Crear `apps/web/lib/roles-actions.ts`:

```typescript
"use server";

import { revalidatePath } from "next/cache";
import {
  countOtherSuperRolesForUser,
  countUsersWithRole,
  createRole,
  createSupabaseServiceRoleClient,
  deleteRole,
  setRolePermissions,
  updateRole,
  type RoleInput,
} from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { requireSuperAdmin } from "@/lib/access-guard";

export type RolesActionResult = { ok: true; error?: never } | { ok?: never; error: string };

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === "23505");
}

export async function createRoleAction(input: RoleInput): Promise<RolesActionResult> {
  const auth = await requireSuperAdmin();
  if (auth.error !== undefined) return { error: auth.error };
  if (!input.name.trim()) return { error: "El nombre del rol es obligatorio." };

  try {
    const admin = createSupabaseServiceRoleClient();
    await createRole(admin, input);
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "Ya existe un rol con un nombre igual o muy parecido." };
    }
    console.error("createRoleAction", error);
    return { error: "No se pudo crear el rol. Intenta de nuevo." };
  }
}

export async function updateRoleAction(
  roleId: string,
  input: RoleInput,
): Promise<RolesActionResult> {
  const auth = await requireSuperAdmin();
  if (auth.error !== undefined) return { error: auth.error };
  if (!input.name.trim()) return { error: "El nombre del rol es obligatorio." };

  try {
    const admin = createSupabaseServiceRoleClient();

    // Si se le está quitando is_super a este rol, verificar que quien ejecuta
    // la acción no dependa de ÉL para seguir siendo superadmin — si es su
    // único rol is_super, quedaría sin acceso al propio editor.
    if (!input.isSuper) {
      const currentUser = await getCurrentUser();
      if (currentUser?.isSuper) {
        const otherSuperRoles = await countOtherSuperRolesForUser(admin, currentUser.id, roleId);
        if (otherSuperRoles === 0) {
          return {
            error: "No puedes quitarle superadmin al único rol que te da acceso de administrador.",
          };
        }
      }
    }

    await updateRole(admin, roleId, input);
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { error: "Ya existe un rol con un nombre igual o muy parecido." };
    }
    console.error("updateRoleAction", error);
    return { error: "No se pudo actualizar el rol. Intenta de nuevo." };
  }
}

export async function deleteRoleAction(roleId: string): Promise<RolesActionResult> {
  const auth = await requireSuperAdmin();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const admin = createSupabaseServiceRoleClient();
    const usersWithRole = await countUsersWithRole(admin, roleId);
    if (usersWithRole > 0) {
      return {
        error: `Este rol tiene ${usersWithRole} usuario(s) asignado(s). Quítaselo a todos antes de eliminarlo.`,
      };
    }
    await deleteRole(admin, roleId);
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    console.error("deleteRoleAction", error);
    return { error: "No se pudo eliminar el rol. Intenta de nuevo." };
  }
}

export async function setRolePermissionsAction(
  roleId: string,
  permissionIds: string[],
): Promise<RolesActionResult> {
  const auth = await requireSuperAdmin();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const admin = createSupabaseServiceRoleClient();
    await setRolePermissions(admin, roleId, permissionIds);
    revalidatePath("/usuarios");
    return { ok: true };
  } catch (error) {
    console.error("setRolePermissionsAction", error);
    return { error: "No se pudieron guardar los permisos. Intenta de nuevo." };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @agency-os/web typecheck`
Expected: éxito. Si `RoleInput` no se exporta todavía desde `@agency-os/db`, confirmar que `packages/db/src/index.ts` incluye `export * from "./repositories/roles";` (ya debería, es preexistente) — el `export interface RoleInput` de Task 3 sale con ese `export *`.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/roles-actions.ts
git commit -m "feat(usuarios): server actions para crear/editar/borrar roles y sus permisos"
```

---

## Task 6: Wrapper cliente de pestañas para /usuarios

**Files:**
- Create: `apps/web/components/access/usuarios-tabs.tsx`

**Interfaces:**
- Consumes: `UnderlineTabs` de `@agency-os/ui` (ya existe, sin consumidor real todavía).
- Produces: `<UsuariosTabs usersContent={...} rolesContent={...} />` — lo usa `apps/web/app/(app)/(hub)/usuarios/page.tsx` (Task 8).

- [ ] **Step 1: Crear el componente**

Crear `apps/web/components/access/usuarios-tabs.tsx`:

```tsx
"use client";

import { useState, type ReactNode } from "react";
import { UnderlineTabs } from "@agency-os/ui";

interface UsuariosTabsProps {
  usersContent: ReactNode;
  rolesContent: ReactNode;
}

/** El server component de /usuarios sigue haciendo todo el fetch de datos y
 * renderiza AccessManager/AreasManager/RolesManager (todos "use client") como
 * elementos ya armados — este wrapper solo decide cuál mostrar, sin tocar el
 * fetching. */
export function UsuariosTabs({ usersContent, rolesContent }: UsuariosTabsProps) {
  const [tab, setTab] = useState<"usuarios" | "roles">("usuarios");

  return (
    <div>
      <UnderlineTabs
        items={[
          { key: "usuarios", label: "Usuarios" },
          { key: "roles", label: "Roles" },
        ]}
        activeKey={tab}
        onSelect={(key) => setTab(key === "roles" ? "roles" : "usuarios")}
        className="mb-6"
      />
      {tab === "usuarios" ? usersContent : rolesContent}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @agency-os/web typecheck`
Expected: éxito (este componente no tiene consumidor todavía hasta Task 8, pero debe typecheckear aislado).

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/access/usuarios-tabs.tsx
git commit -m "feat(usuarios): wrapper de pestañas Usuarios/Roles"
```

---

## Task 7: Componente del editor de roles

**Files:**
- Create: `apps/web/components/access/roles-manager.tsx`

**Interfaces:**
- Consumes: `groupPermissions` de `@agency-os/domain` (Task 1); `createRoleAction`, `updateRoleAction`, `deleteRoleAction`, `setRolePermissionsAction` de `@/lib/roles-actions` (Task 5); `Badge`, `Button`, `Checkbox`, `Input`, `Label`, `Modal`, `Select` de `@agency-os/ui` (confirmar en Step 0 cuáles de estos existen ya).
- Produces: `<RolesManager roles={...} permissions={...} rolePermissionsByRole={...} modules={...} />` — lo usa `apps/web/app/(app)/(hub)/usuarios/page.tsx` (Task 8).

- [ ] **Step 0: Confirmar los componentes de `@agency-os/ui` disponibles**

Run: `grep -n "^export" "/Users/yesscreativo/Documents/Laburu/Agency OS/packages/ui/src/index.ts"`
Expected: ver si existe un componente `Checkbox`. Si NO existe, usar `<input type="checkbox" className="h-4 w-4 rounded border-line-strong" />` directo en vez de un componente `Checkbox` (el código de abajo ya usa `<input type="checkbox">` crudo por esta razón — no depende de que exista `Checkbox` en el kit).

- [ ] **Step 1: Crear el componente**

Crear `apps/web/components/access/roles-manager.tsx`:

```tsx
"use client";

import { useMemo, useState, useTransition } from "react";
import { groupPermissions } from "@agency-os/domain";
import { Badge, Button, Input, Label, Modal, Select } from "@agency-os/ui";
import {
  createRoleAction,
  deleteRoleAction,
  setRolePermissionsAction,
  updateRoleAction,
} from "@/lib/roles-actions";

export interface RolesManagerRole {
  id: string;
  name: string;
  moduleCode: string | null;
  isSuper: boolean;
}

export interface RolesManagerPermission {
  id: string;
  code: string;
  name: string;
  description: string | null;
}

export interface RolesManagerModule {
  code: string;
  name: string;
}

interface RolesManagerProps {
  roles: RolesManagerRole[];
  permissions: RolesManagerPermission[];
  /** permission ids actuales por rol, ej. { "<roleId>": ["<permId>", ...] } */
  rolePermissionsByRole: Record<string, string[]>;
  modules: RolesManagerModule[];
}

interface RoleFormState {
  name: string;
  moduleCode: string;
  isSuper: boolean;
}

function emptyForm(): RoleFormState {
  return { name: "", moduleCode: "", isSuper: false };
}

export function RolesManager({
  roles,
  permissions,
  rolePermissionsByRole,
  modules,
}: RolesManagerProps) {
  const [selectedId, setSelectedId] = useState<string | null>(roles[0]?.id ?? null);
  const [form, setForm] = useState<RoleFormState>(() => {
    const first = roles[0];
    return first
      ? { name: first.name, moduleCode: first.moduleCode ?? "", isSuper: first.isSuper }
      : emptyForm();
  });
  const [checkedIds, setCheckedIds] = useState<Set<string>>(
    () => new Set(roles[0] ? rolePermissionsByRole[roles[0].id] ?? [] : []),
  );
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState<RoleFormState>(emptyForm());
  const [deleting, setDeleting] = useState<RolesManagerRole | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const selectedRole = roles.find((r) => r.id === selectedId) ?? null;
  const groups = useMemo(() => groupPermissions(permissions), [permissions]);

  const selectRole = (role: RolesManagerRole) => {
    setSelectedId(role.id);
    setForm({ name: role.name, moduleCode: role.moduleCode ?? "", isSuper: role.isSuper });
    setCheckedIds(new Set(rolePermissionsByRole[role.id] ?? []));
    setError(null);
  };

  const togglePermission = (permissionId: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(permissionId)) next.delete(permissionId);
      else next.add(permissionId);
      return next;
    });
  };

  const saveChanges = () => {
    if (!selectedRole) return;
    setError(null);
    startTransition(async () => {
      const input = {
        name: form.name,
        moduleCode: form.moduleCode || null,
        isSuper: form.isSuper,
      };
      const updateResult = await updateRoleAction(selectedRole.id, input);
      if (updateResult.error) {
        setError(updateResult.error);
        return;
      }
      const permsResult = await setRolePermissionsAction(selectedRole.id, [...checkedIds]);
      if (permsResult.error) {
        setError(permsResult.error);
      }
    });
  };

  const openCreate = () => {
    setCreateForm(emptyForm());
    setError(null);
    setCreating(true);
  };

  const submitCreate = () => {
    if (!createForm.name.trim()) return;
    startTransition(async () => {
      const result = await createRoleAction({
        name: createForm.name,
        moduleCode: createForm.moduleCode || null,
        isSuper: createForm.isSuper,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      setCreating(false);
    });
  };

  const submitDelete = () => {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteRoleAction(deleting.id);
      if (result.error) {
        setError(result.error);
        return;
      }
      if (selectedId === deleting.id) setSelectedId(null);
      setDeleting(null);
    });
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[280px_1fr]">
      <div>
        <Button onClick={openCreate} className="mb-3 w-full">
          + Nuevo rol
        </Button>
        <div className="space-y-1">
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => selectRole(role)}
              className={`flex w-full items-center justify-between gap-2 rounded-[10px] px-3 py-2 text-left text-sm transition ${
                role.id === selectedId
                  ? "bg-surface-2 font-semibold"
                  : "hover:bg-surface-2/60"
              }`}
            >
              <span>{role.name}</span>
              <span className="flex gap-1">
                {role.isSuper && <Badge tone="warn">Super</Badge>}
                {role.moduleCode && <Badge tone="neutral">{role.moduleCode}</Badge>}
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
        {!selectedRole ? (
          <p className="text-sm text-muted">Selecciona un rol para editarlo.</p>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <Label htmlFor="role-name">Nombre</Label>
                <Input
                  id="role-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="role-module">Módulo</Label>
                <Select
                  id="role-module"
                  value={form.moduleCode}
                  onChange={(e) => setForm((f) => ({ ...f, moduleCode: e.target.value }))}
                >
                  <option value="">Sistema</option>
                  {modules.map((m) => (
                    <option key={m.code} value={m.code}>
                      {m.name}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-line-strong"
                    checked={form.isSuper}
                    onChange={(e) => setForm((f) => ({ ...f, isSuper: e.target.checked }))}
                  />
                  Superadmin (`is_super`)
                </label>
                {form.isSuper && (
                  <p className="mt-1 text-xs text-danger">
                    Este rol se salta todos los chequeos de permiso.
                  </p>
                )}
              </div>
            </div>

            <div className="mt-6 space-y-5">
              {groups.map((group) => (
                <div key={group.label}>
                  <h3 className="text-sm font-bold tracking-tight">{group.label}</h3>
                  <div className="mt-2 space-y-2">
                    {group.items.map((permission) => (
                      <label key={permission.id} className="flex items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-4 w-4 rounded border-line-strong"
                          checked={checkedIds.has(permission.id)}
                          onChange={() => togglePermission(permission.id)}
                        />
                        <span>
                          <span className="font-medium">{permission.name}</span>
                          {permission.description && (
                            <span className="block text-xs text-muted">
                              {permission.description}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {error && <p className="mt-4 text-sm text-danger">{error}</p>}

            <div className="mt-6 flex justify-between">
              <Button variant="danger" onClick={() => setDeleting(selectedRole)}>
                Eliminar rol
              </Button>
              <Button onClick={saveChanges} disabled={pending || !form.name.trim()}>
                {pending ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </>
        )}
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="Nuevo rol"
        footer={
          <>
            <Button variant="outline" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button onClick={submitCreate} disabled={pending || !createForm.name.trim()}>
              {pending ? "Creando…" : "Crear"}
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div>
            <Label htmlFor="new-role-name">Nombre</Label>
            <Input
              id="new-role-name"
              value={createForm.name}
              onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Ej. Editor de contenido"
            />
          </div>
          <div>
            <Label htmlFor="new-role-module">Módulo</Label>
            <Select
              id="new-role-module"
              value={createForm.moduleCode}
              onChange={(e) => setCreateForm((f) => ({ ...f, moduleCode: e.target.value }))}
            >
              <option value="">Sistema</option>
              {modules.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-line-strong"
              checked={createForm.isSuper}
              onChange={(e) => setCreateForm((f) => ({ ...f, isSuper: e.target.checked }))}
            />
            Superadmin (`is_super`)
          </label>
        </div>
        {error && creating && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>

      <Modal
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title="Eliminar rol"
        description={
          deleting ? `Se eliminará el rol "${deleting.name}". Esta acción no se puede deshacer.` : undefined
        }
        footer={
          <>
            <Button variant="outline" onClick={() => setDeleting(null)}>
              Cancelar
            </Button>
            <Button variant="danger" onClick={submitDelete} disabled={pending}>
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
Expected: puede fallar si `Badge` no acepta `tone="warn"` o si `Modal`/`Select`/`Input`/`Label`/`Button` tienen props distintas a las usadas aquí. Si falla, abrir `packages/ui/src/badge.tsx` (y el componente que falle) y ajustar los props usados a los que realmente expone — sin cambiar el comportamiento descrito arriba, solo la forma de invocarlo.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/access/roles-manager.tsx
git commit -m "feat(usuarios): UI del editor de roles (crear, editar, permisos, borrar)"
```

---

## Task 8: Cablear la pestaña "Roles" en /usuarios

**Files:**
- Modify: `apps/web/app/(app)/(hub)/usuarios/page.tsx`

**Interfaces:**
- Consumes: `listAllRoles`, `listRolePermissionPairs`, `listPermissions` de `@agency-os/db` (Tasks 2 y 3); `UsuariosTabs` (Task 6); `RolesManager` (Task 7).
- Produces: página completa — no lo consume ninguna otra tarea.

- [ ] **Step 1: Reemplazar el archivo completo**

Reemplazar `apps/web/app/(app)/(hub)/usuarios/page.tsx`:

```tsx
import { redirect } from "next/navigation";
import {
  listAreas,
  listAllRoles,
  listAssignableRoles,
  listModules,
  listOrgUsers,
  listPermissions,
  listRolePermissionPairs,
} from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { AccessManager } from "@/components/access/access-manager";
import { AreasManager } from "@/components/access/areas-manager";
import { RolesManager } from "@/components/access/roles-manager";
import { UsuariosTabs } from "@/components/access/usuarios-tabs";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.isSuper) redirect("/inicio");

  const organizationId = user.organizationIds[0] ?? "";
  const db = await getSupabaseServerClient();
  const [orgUsers, assignableRoles, modules, areas, allRoles, permissions, rolePermissionPairs] =
    await Promise.all([
      listOrgUsers(db, organizationId),
      listAssignableRoles(db),
      listModules(db),
      listAreas(db, organizationId),
      listAllRoles(db),
      listPermissions(db),
      listRolePermissionPairs(db),
    ]);

  const rolePermissionsByRole: Record<string, string[]> = {};
  for (const pair of rolePermissionPairs) {
    const list = rolePermissionsByRole[pair.role_id];
    if (list) list.push(pair.permission_id);
    else rolePermissionsByRole[pair.role_id] = [pair.permission_id];
  }

  return (
    <UsuariosTabs
      usersContent={
        <>
          <AccessManager
            users={orgUsers}
            roles={assignableRoles.map((r) => ({ id: r.id, name: r.name, moduleCode: r.module_code }))}
            modules={modules.map((m) => ({ code: m.code, name: m.name }))}
            areas={areas.map((a) => ({ id: a.id, name: a.name }))}
            currentUserId={user.id}
          />
          <AreasManager
            areas={areas.map((a) => ({
              id: a.id,
              name: a.name,
              managerUserId: a.manager_user_id,
              managerName: a.managerName,
            }))}
            users={orgUsers.map((u) => ({ id: u.id, fullName: u.fullName }))}
          />
        </>
      }
      rolesContent={
        <RolesManager
          roles={allRoles.map((r) => ({
            id: r.id,
            name: r.name,
            moduleCode: r.module_code,
            isSuper: r.is_super,
          }))}
          permissions={permissions.map((p) => ({
            id: p.id,
            code: p.code,
            name: p.name,
            description: p.description,
          }))}
          rolePermissionsByRole={rolePermissionsByRole}
          modules={modules.map((m) => ({ code: m.code, name: m.name }))}
        />
      }
    />
  );
}
```

- [ ] **Step 2: Typecheck completo**

Run: `pnpm typecheck`
Expected: los 8 paquetes en verde (`@agency-os/domain`, `@agency-os/db`, `@agency-os/ui`, `@agency-os/web`, `migrate-legacy`).

- [ ] **Step 3: Verificación manual (no hay tests de UI en este repo)**

Con el dev server corriendo (`pnpm dev`, o el que ya esté activo), entrar a `/usuarios` con una cuenta `is_super` y confirmar:
1. La pestaña "Usuarios" se ve igual que antes (sin regresión).
2. La pestaña "Roles" lista los 13 roles actuales, con "Super"/módulo como badges.
3. Seleccionar "Creador" muestra sus permisos marcados correctamente (comparar contra `role_permissions` real si hay dudas).
4. Crear un rol de prueba, marcarle 1-2 permisos, guardar, recargar la página → el rol y sus permisos siguen ahí.
5. Intentar eliminar un rol CON usuarios asignados (ej. "Creador") → debe bloquear con el mensaje de "N usuario(s) asignado(s)".
6. Eliminar el rol de prueba (sin usuarios asignados) → debe desaparecer de la lista.
7. Con la MISMA cuenta con la que se probó, intentar desmarcar `is_super` del rol "Administrador" que le da su propio acceso → debe bloquear con el mensaje de "único rol que te da acceso".

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(app)/(hub)/usuarios/page.tsx"
git commit -m "feat(usuarios): agregar pestaña Roles a /usuarios"
```

---

## Self-Review (hecho al escribir este plan)

- **Cobertura de la spec:** pestaña Roles (Task 8) ✓, etiquetas de grupo (Task 1) ✓, panel maestro-detalle crear/editar/permisos/borrar (Task 7) ✓, guard de borrado en uso (Tasks 3+5) ✓, guard de auto-desbloqueo de superadmin (Tasks 3+5) ✓, sin migración nueva ✓, `requireSuperAdmin` compartido sin duplicar (Task 4) ✓.
- **Simplificación consciente respecto a la spec:** la spec mencionaba "grupos colapsables" y una prop `currentUserRoleIds` para deshabilitar el checkbox de `is_super` en el cliente antes de intentarlo. Este plan los deja como grupos estáticos (no colapsables — 19 permisos en 7 grupos no lo necesitan todavía) y el guard de auto-desbloqueo queda solo server-side (el error se muestra igual si se intenta, solo que no se previene visualmente de antemano). Ambas son simplificaciones YAGNI razonables para la primera versión; si el listado de permisos crece mucho, agregar colapso es un cambio aislado a `roles-manager.tsx`.
- **Tipos consistentes:** `RoleInput` (Task 3) se usa igual en `roles-actions.ts` (Task 5) y como base de `RoleFormState` en `roles-manager.tsx` (Task 7, con `moduleCode` como string vacío en el form y convertido a `null` al enviar). `RolesActionResult` (Task 5) es el shape que `roles-manager.tsx` espera (`.error`/`.ok`).
