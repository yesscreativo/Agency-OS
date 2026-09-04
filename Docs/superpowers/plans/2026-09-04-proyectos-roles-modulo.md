# Roles delegados del módulo Proyectos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dos roles nuevos y propios de Proyectos (`proyectos_admin`, `proyectos_colaborador`) asignables desde una página propia del módulo (`/proyectos/usuarios`), sin depender del Administrador de sistema.

**Architecture:** Migración de datos (permiso `project.manage_access` + 2 roles con `module_code='proyectos'`) + server actions nuevas (`apps/web/lib/proyectos-access-actions.ts`, separadas de `access-actions.ts`) + página y componente nuevos, gateados por `hasPermission(user, "project.manage_access")`. `/usuarios` y `access-actions.ts` no se tocan. Spec: `Docs/superpowers/specs/2026-09-04-proyectos-roles-modulo-design.md`.

**Tech Stack:** Next.js (App Router, server components + server actions), Supabase (Postgres + RLS), TypeScript, `@agency-os/{db,ui}`.

## Global Constraints

- Cuerpo/UI en **español**.
- BD en `snake_case`.
- Migración nueva se numera consecutiva: **030** (última actual = 029). Aplicar al remoto `hicbkpwywwhnhiawulmu` vía MCP `apply_migration`, y reflejar el mismo SQL en `supabase/migrations/030_*.sql`.
- Tras cada tarea con código: `pnpm typecheck && pnpm lint` verdes antes de commitear.
- No correr `pnpm build` con `pnpm dev` activo (corrompe `.next`).
- Verificación visual real la hace Yesid en su Chrome admin.
- `project.manage_access` NUNCA se comprueba junto con `users.manage`; son puertas separadas. La action SIEMPRE revalida en servidor que el rol objetivo tenga `module_code = 'proyectos'`, sin confiar solo en la UI.

---

## File Structure

- `supabase/migrations/030_proyectos_roles.sql` — permiso `project.manage_access` + roles `proyectos_admin`/`proyectos_colaborador` + sus `role_permissions`.
- `packages/db/src/repositories/roles.ts` — nueva función `listRolesByModule`.
- `apps/web/lib/proyectos-access-actions.ts` — `grantProjectRole`, `revokeProjectRole`.
- `apps/web/components/proyectos/proyectos-access-manager.tsx` — UI de la página (tabla de usuarios + modal de asignar rol).
- `apps/web/app/(app)/proyectos/usuarios/page.tsx` — carga datos y gatea por `project.manage_access`.
- `apps/web/components/proyectos/projects-sidebar.tsx` — link "Accesos" nuevo.
- `apps/web/app/(app)/proyectos/layout.tsx` — calcula y pasa `canManageAccess`.
- `Docs/10-Product/Roles-Permissions.md` — documenta los roles nuevos y el patrón de delegación por módulo.

---

## Task 1: Migración — permiso + roles de Proyectos

**Files:**
- Create: `supabase/migrations/030_proyectos_roles.sql`
- Modify (remote): aplicar vía MCP `apply_migration` a `hicbkpwywwhnhiawulmu`

**Interfaces:**
- Produces: permiso `project.manage_access`; roles `proyectos_admin` (`project.view`+`project.manage`+`project.assign`+`project.manage_access`), `proyectos_colaborador` (`project.view`+`project.assign`).

- [ ] **Step 1: Escribir el SQL de la migración**

```sql
-- Roles delegados del módulo Proyectos: permiten asignar acceso a Proyectos sin
-- ser Administrador de sistema, siguiendo el mismo patrón que kam.manage (010)
-- para CRM. Ver Docs/superpowers/specs/2026-09-04-proyectos-roles-modulo-design.md.

insert into public.permissions (code, name, description) values
  ('project.manage_access', 'Gestionar accesos de Proyectos', 'Asignar o revocar los roles propios del módulo Proyectos (Proyectos - Admin, Proyectos - Colaborador) sin ser Administrador de sistema.');

insert into public.roles (code, name, module_code) values
  ('proyectos_admin', 'Proyectos - Admin', 'proyectos'),
  ('proyectos_colaborador', 'Proyectos - Colaborador', 'proyectos');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'proyectos_admin' and p.code in ('project.view', 'project.manage', 'project.assign', 'project.manage_access');

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r, public.permissions p
where r.code = 'proyectos_colaborador' and p.code in ('project.view', 'project.assign');
```

- [ ] **Step 2: Aplicar al remoto**

Usar MCP `apply_migration` con `project_id=hicbkpwywwhnhiawulmu`, `name=030_proyectos_roles` y el SQL de arriba.
Expected: `{"success":true}`.

- [ ] **Step 3: Verificar**

MCP `execute_sql`:
```sql
select r.code, r.module_code, array_agg(p.code order by p.code) as perms
from public.roles r
join public.role_permissions rp on rp.role_id = r.id
join public.permissions p on p.id = rp.permission_id
where r.code in ('proyectos_admin', 'proyectos_colaborador')
group by r.code, r.module_code;
```
Expected: `proyectos_admin` → `{project.assign,project.manage,project.manage_access,project.view}`; `proyectos_colaborador` → `{project.assign,project.view}`; ambos con `module_code='proyectos'`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/030_proyectos_roles.sql
git commit -m "Proyectos: migración 030 — roles proyectos_admin/proyectos_colaborador + project.manage_access"
```

## Task 2: Repo `listRolesByModule`

**Files:**
- Modify: `packages/db/src/repositories/roles.ts`

**Interfaces:**
- Produces: `listRolesByModule(db: Db, moduleCode: string): Promise<RoleRow[]>`

- [ ] **Step 1: Añadir la función**

Al final de `packages/db/src/repositories/roles.ts`:

```ts
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
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: 8 tasks successful.

- [ ] **Step 3: Commit**

```bash
git add packages/db/src/repositories/roles.ts
git commit -m "Proyectos: repo listRolesByModule"
```

## Task 3: Server actions de acceso de Proyectos

**Files:**
- Create: `apps/web/lib/proyectos-access-actions.ts`

**Interfaces:**
- Consumes: `getCurrentUser`, `hasPermission` de `@/lib/auth`; `getSupabaseServerClient`; `grantUserRole`, `revokeUserRole` de `@agency-os/db`.
- Produces:
  - `type AccessActionResult = { ok: true; error?: never } | { ok?: never; error: string }`
  - `grantProjectRole(userId: string, roleId: string): Promise<AccessActionResult>`
  - `revokeProjectRole(userRoleId: string): Promise<AccessActionResult>`

- [ ] **Step 1: Implementar**

```ts
"use server";

import { revalidatePath } from "next/cache";
import { grantUserRole, revokeUserRole } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type AccessActionResult = { ok: true; error?: never } | { ok?: never; error: string };

/** Guarda común: exige project.manage_access (proyectos_admin o super admin).
 * Puerta separada de users.manage — nunca se mezclan. */
async function requireProjectAccessManager() {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." } as const;
  if (!hasPermission(user, "project.manage_access")) {
    return { error: "No tienes permiso para gestionar accesos de Proyectos." } as const;
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." } as const;
  return { organizationId } as const;
}

export async function grantProjectRole(userId: string, roleId: string): Promise<AccessActionResult> {
  const auth = await requireProjectAccessManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (!userId || !roleId) return { error: "Selecciona usuario y rol." };

  try {
    const db = await getSupabaseServerClient();
    // Defensa en profundidad: el rol objetivo debe ser de Proyectos, sin
    // importar qué mande el cliente — así esta puerta nunca sirve para tocar
    // Administrador ni roles de otro módulo.
    const { data: role } = await db
      .from("roles")
      .select("module_code")
      .eq("id", roleId)
      .maybeSingle();
    if (!role || role.module_code !== "proyectos") {
      return { error: "Rol inválido." };
    }
    await grantUserRole(db, { userId, roleId, organizationId: auth.organizationId });
    revalidatePath("/proyectos/usuarios");
    return { ok: true };
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "23505") {
      return { ok: true };
    }
    console.error("grantProjectRole", error);
    return { error: "No se pudo asignar el rol. Intenta de nuevo." };
  }
}

export async function revokeProjectRole(userRoleId: string): Promise<AccessActionResult> {
  const auth = await requireProjectAccessManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (!userRoleId) return { error: "Asignación inválida." };

  try {
    const db = await getSupabaseServerClient();
    const { data: row } = await db
      .from("user_roles")
      .select("id, organization_id, role_id")
      .eq("id", userRoleId)
      .maybeSingle();
    if (!row || row.organization_id !== auth.organizationId) {
      return { error: "Asignación inválida." };
    }
    const { data: role } = await db
      .from("roles")
      .select("module_code")
      .eq("id", row.role_id)
      .maybeSingle();
    if (!role || role.module_code !== "proyectos") {
      return { error: "Asignación inválida." };
    }
    await revokeUserRole(db, userRoleId);
    revalidatePath("/proyectos/usuarios");
    return { ok: true };
  } catch (error) {
    console.error("revokeProjectRole", error);
    return { error: "No se pudo revocar el acceso. Intenta de nuevo." };
  }
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/proyectos-access-actions.ts
git commit -m "Proyectos: server actions de acceso (grantProjectRole/revokeProjectRole)"
```

## Task 4: UI — `ProyectosAccessManager`

**Files:**
- Create: `apps/web/components/proyectos/proyectos-access-manager.tsx`

**Interfaces:**
- Consumes: `grantProjectRole`, `revokeProjectRole` (Task 3); `Badge`, `Button`, `Label`, `Modal`, `Select`, `Table`, `Td`, `Th` de `@agency-os/ui`.
- Produces:
  - `interface ProyectosAccessUserRow { id: string; fullName: string; email: string | null; projectRoles: { userRoleId: string; roleName: string }[] }`
  - `interface ProyectosRoleOption { id: string; name: string }`
  - `<ProyectosAccessManager users={ProyectosAccessUserRow[]} roles={ProyectosRoleOption[]} />`

- [ ] **Step 1: Implementar el componente**

```tsx
"use client";

// Página de accesos propia de Proyectos: asigna/revoca SOLO los roles del
// módulo (proyectos_admin, proyectos_colaborador). No invita ni elimina
// usuarios — eso sigue siendo exclusivo de /usuarios.

import { useState, useTransition } from "react";
import { Badge, Button, Label, Modal, Select, Table, Td, Th } from "@agency-os/ui";
import { grantProjectRole, revokeProjectRole } from "@/lib/proyectos-access-actions";

export interface ProyectosAccessUserRow {
  id: string;
  fullName: string;
  email: string | null;
  /** Roles de Proyectos ya asignados a este usuario (0, 1 o los 2). */
  projectRoles: { userRoleId: string; roleName: string }[];
}

export interface ProyectosRoleOption {
  id: string;
  name: string;
}

interface ProyectosAccessManagerProps {
  users: ProyectosAccessUserRow[];
  roles: ProyectosRoleOption[];
}

export function ProyectosAccessManager({ users, roles }: ProyectosAccessManagerProps) {
  const [assigning, setAssigning] = useState<ProyectosAccessUserRow | null>(null);
  const [roleId, setRoleId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const openAssign = (user: ProyectosAccessUserRow) => {
    setAssigning(user);
    setRoleId("");
    setError(null);
  };

  const submitAssign = () => {
    if (!assigning || !roleId) return;
    startTransition(async () => {
      const result = await grantProjectRole(assigning.id, roleId);
      if (result.error) setError(result.error);
      else setAssigning(null);
    });
  };

  const revoke = (userRoleId: string) => {
    startTransition(async () => {
      await revokeProjectRole(userRoleId);
    });
  };

  return (
    <div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Accesos de Proyectos</h1>
        <p className="mt-1 text-sm text-muted">
          Da o quita el acceso al módulo Proyectos, sin tocar el resto de accesos del sistema.
        </p>
      </div>

      <div className="mt-6">
        <Table>
          <thead>
            <tr>
              <Th>Usuario</Th>
              <Th>Rol de Proyectos</Th>
              <Th className="text-right"> </Th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user.id} className="transition hover:bg-surface-2">
                <Td>
                  <div className="text-sm font-semibold">{user.fullName}</div>
                  {user.email && <div className="text-xs text-muted">{user.email}</div>}
                </Td>
                <Td>
                  {user.projectRoles.length === 0 ? (
                    <Badge tone="neutral">Sin acceso a Proyectos</Badge>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {user.projectRoles.map((r) => (
                        <span
                          key={r.userRoleId}
                          className="inline-flex items-center gap-1.5 rounded-pill border border-line-strong px-2.5 py-1 text-xs"
                        >
                          <span className="font-semibold">{r.roleName}</span>
                          <button
                            type="button"
                            aria-label={`Revocar ${r.roleName}`}
                            disabled={pending}
                            onClick={() => revoke(r.userRoleId)}
                            className="cursor-pointer text-muted transition hover:text-danger"
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </Td>
                <Td className="text-right">
                  <Button variant="outline" size="sm" onClick={() => openAssign(user)}>
                    Asignar rol
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <Modal
        open={assigning !== null}
        onClose={() => setAssigning(null)}
        title="Asignar rol de Proyectos"
        description={assigning ? `Da acceso a ${assigning.fullName}.` : undefined}
        footer={
          <>
            <Button variant="outline" onClick={() => setAssigning(null)}>
              Cancelar
            </Button>
            <Button onClick={submitAssign} disabled={pending || !roleId}>
              {pending ? "Asignando…" : "Asignar"}
            </Button>
          </>
        }
      >
        <Label htmlFor="assign-project-role">Rol</Label>
        <Select id="assign-project-role" value={roleId} onChange={(e) => setRoleId(e.target.value)}>
          <option value="">Selecciona un rol…</option>
          {roles.map((role) => (
            <option key={role.id} value={role.id}>
              {role.name}
            </option>
          ))}
        </Select>
        {error && assigning && <p className="mt-2 text-sm text-danger">{error}</p>}
      </Modal>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/proyectos/proyectos-access-manager.tsx
git commit -m "Proyectos: componente ProyectosAccessManager"
```

## Task 5: Página `/proyectos/usuarios`

**Files:**
- Create: `apps/web/app/(app)/proyectos/usuarios/page.tsx`

**Interfaces:**
- Consumes: `listOrgUsers`, `listRolesByModule` de `@agency-os/db`; `getCurrentUser`, `hasPermission` de `@/lib/auth`; `NoAccessPanel`; `ProyectosAccessManager` (Task 4).

- [ ] **Step 1: Implementar la página**

```tsx
import { redirect } from "next/navigation";
import { listOrgUsers, listRolesByModule } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { NoAccessPanel } from "@/components/no-access-panel";
import { ProyectosAccessManager } from "@/components/proyectos/proyectos-access-manager";

export const dynamic = "force-dynamic";

export default async function ProyectosUsuariosPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  if (!hasPermission(user, "project.manage_access")) {
    return (
      <div className="mx-auto max-w-[560px]">
        <NoAccessPanel
          title="No tienes acceso a esta sección"
          message="Gestionar accesos de Proyectos requiere el rol 'Proyectos - Admin' (o ser Administrador de sistema)."
        />
      </div>
    );
  }

  const organizationId = user.organizationIds[0] ?? "";
  const db = await getSupabaseServerClient();
  const [orgUsers, projectRoles] = await Promise.all([
    listOrgUsers(db, organizationId),
    listRolesByModule(db, "proyectos"),
  ]);

  const users = orgUsers.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    email: u.email,
    projectRoles: u.roles
      .filter((r) => r.moduleCode === "proyectos")
      .map((r) => ({ userRoleId: r.userRoleId, roleName: r.roleName })),
  }));

  return (
    <ProyectosAccessManager
      users={users}
      roles={projectRoles.map((r) => ({ id: r.id, name: r.name }))}
    />
  );
}
```

- [ ] **Step 2: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/(app)/proyectos/usuarios/page.tsx"
git commit -m "Proyectos: página /proyectos/usuarios"
```

## Task 6: Link "Accesos" en el sidebar

**Files:**
- Modify: `apps/web/components/proyectos/projects-sidebar.tsx`
- Modify: `apps/web/app/(app)/proyectos/layout.tsx`

**Interfaces:**
- Produces: prop `canManageAccess?: boolean` en `ProjectsSidebar`.

- [ ] **Step 1: Sidebar** — añadir el prop y el link

En `projects-sidebar.tsx`, añadir `canManageAccess = false` a los props de `ProjectsSidebar` (junto a `canManage`), y dentro del bloque del footer (antes de los dos `SidebarPlaceholder`):

```tsx
{canManageAccess && (
  <a
    href="/proyectos/usuarios"
    className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 text-sm transition ${
      pathname === "/proyectos/usuarios"
        ? "bg-green font-semibold text-green-ink"
        : "text-muted hover:bg-surface-2 hover:text-ink"
    }`}
  >
    Accesos
  </a>
)}
```

- [ ] **Step 2: Layout** — calcular y pasar el prop

En `apps/web/app/(app)/proyectos/layout.tsx`, junto a `const canManage = hasPermission(user, "project.manage");`:

```ts
const canManageAccess = hasPermission(user, "project.manage_access");
```

Y en el JSX:

```tsx
<ProjectsSidebar
  clients={clients}
  clientsForCreate={clientsForCreate}
  canManage={canManage}
  canManageAccess={canManageAccess}
/>
```

- [ ] **Step 3: Typecheck + lint**

Run: `pnpm typecheck && pnpm lint`
Expected: verdes.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/proyectos/projects-sidebar.tsx "apps/web/app/(app)/proyectos/layout.tsx"
git commit -m "Proyectos: link 'Accesos' en el sidebar (project.manage_access)"
```

## Task 7: Documentar el patrón en Roles-Permissions.md

**Files:**
- Modify: `Docs/10-Product/Roles-Permissions.md`

- [ ] **Step 1: Añadir las secciones nuevas**

Reemplazar el contenido completo de `Docs/10-Product/Roles-Permissions.md` por:

```md
# Roles y Permisos

## Roles
- Administrador
- Director
- RRHH
- KAM
- PM
- Líder
- Colaborador
- Cliente

## Roles de módulo (delegados)
Los roles con `module_code` dan acceso a un módulo específico y pueden asignarse
sin ser Administrador de sistema, a través de una página propia del módulo (no
`/usuarios`). Roles actuales:
- **CRM:** Administrador CRM (`crm_admin`), Creador (`crm_creator`), Visualizador (`crm_viewer`) — el rol en sí lo asigna el super admin desde `/usuarios`; `crm_admin` administra el catálogo de KAM/PM en `/crm/kams` vía el permiso `kam.manage`.
- **Proyectos:** Proyectos - Admin (`proyectos_admin`), Proyectos - Colaborador (`proyectos_colaborador`) — un `proyectos_admin` (o el super admin) asigna/revoca estos dos roles desde `/proyectos/usuarios`, vía el permiso `project.manage_access`.

### Patrón para delegar accesos de un módulo nuevo
1. Crear el/los rol(es) del módulo con `module_code = '<modulo>'`.
2. Crear un permiso `<modulo>.manage_access` y dárselo al rol que debe poder delegar.
3. Una página propia del módulo (ej. `/<modulo>/usuarios`) con sus propias server actions, gateadas por `hasPermission(user, "<modulo>.manage_access")`.
4. La action SIEMPRE revalida en servidor que el rol objetivo tenga `module_code = '<modulo>'` antes de asignar/revocar — nunca confiar solo en la UI.
5. `/usuarios` y `access-actions.ts` (invitar, eliminar cuentas, roles de sistema) no se tocan — siguen exclusivos del Administrador de sistema.

## Modelo
Los permisos controlan las acciones.
Los roles agrupan permisos.
Un usuario puede tener múltiples roles y permisos directos.
```

- [ ] **Step 2: Commit**

```bash
git add Docs/10-Product/Roles-Permissions.md
git commit -m "docs: patrón de roles delegados por módulo + roles de Proyectos"
```

## Task 8: Checkpoint de verificación (Yesid)

- [ ] **Step 1: Verificación de datos (MCP)**

`execute_sql`: confirmar que un `user_role` de prueba con `proyectos_admin` se puede insertar/borrar sin error de RLS (usando el patrón de simulación de JWT ya usado en la sesión).

- [ ] **Step 2: Checklist para Yesid (Chrome admin)**

- Con la cuenta super admin: entrar a `/proyectos/usuarios`, asignar "Proyectos - Admin" a un usuario de prueba.
- Loguearse (u otra sesión) como ese usuario de prueba: debe ver el link "Accesos" en el sidebar de Proyectos y poder entrar a `/proyectos/usuarios`, y asignar/revocar `proyectos_admin`/`proyectos_colaborador` a otros.
- Ese mismo usuario, SIN el rol Administrador de sistema, NO debe poder entrar a `/usuarios` (sigue redirigiendo a `/inicio`).
- Un usuario con solo "Proyectos - Colaborador" NO debe ver el link "Accesos" ni poder entrar a `/proyectos/usuarios` (debe ver el panel de "no tienes acceso").
- Revocar el rol de prueba al finalizar.

---

## Self-Review (autor del plan)

- **Cobertura de la spec:** roles nuevos con permisos correctos (Task 1) ✓, página propia sin tocar `/usuarios`/`access-actions.ts` (Task 3, 5) ✓, defensa en profundidad por `module_code` en ambas actions (Task 3) ✓, link condicionado al permiso (Task 6) ✓, documentación del patrón para módulos futuros (Task 7) ✓. Fuera de alcance (sección de datos del equipo, editor de roles, invitar/eliminar cuentas) no se implementa ✓.
- **Consistencia de tipos:** `grantProjectRole`/`revokeProjectRole` (Task 3) usados igual en `proyectos-access-manager.tsx` (Task 4); `ProyectosAccessUserRow`/`ProyectosRoleOption` (Task 4) construidos igual en la page (Task 5); `listRolesByModule` (Task 2) consumido en Task 5 con la firma exacta.
- **Placeholders:** ninguno — todo el código de cada tarea está completo y es el archivo final (no pseudo-código).
