# Portal Cliente (login) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir la base de identidad y acceso para que contactos de un cliente (varias personas por cliente, cada una con su cuenta) inicien sesión en `/portal`, aislada por completo del RBAC interno de Laburu. Sin funcionalidad visible todavía — es la base para Tickets (siguiente spec) y, más adelante, Parrillas.

**Architecture:** Nueva tabla `client_contacts` (identidad separada de `users`/`people`/`roles`), vinculada 1:1 a una cuenta de Supabase Auth por `auth_user_id`. Un mismo email de Supabase Auth es *o* colaborador interno *o* contacto de cliente — nunca ambos, garantizado por el trigger existente `handle_new_auth_user` (solo auto-provisiona `people`/`users` para `@laburuagencia.com`) más una validación explícita al invitar. Árbol de rutas aparte (`/portal/*`), con guards cruzados en ambos sentidos: `(app)` redirige a `/portal` si la sesión es un contacto de cliente, y `/portal` redirige a `/inicio` si la sesión es un colaborador interno.

**Tech Stack:** Next.js/TypeScript/Tailwind, Supabase (Postgres/RLS/Auth). Sin dependencias nuevas.

## Global Constraints

- Un contacto pertenece a un solo cliente (v1) — sin soporte multi-cliente por contacto.
- Nadie se autoregistra: toda cuenta nace de una invitación explícita desde `/crm/clientes/[id]`.
- Deshabilitar es la única baja de acceso en v1 (reversible vía reactivar); no hay borrado de cuenta.
- `/portal` no comparte layout, nav ni componentes con `(app)` — árbol de rutas aparte en el mismo dominio (sin subdominio propio).
- Copy en español; `snake_case` en DB.
- La spec dice "nueva pestaña Portal" en la ficha de cliente, pero esa página (`/crm/clientes/[id]/page.tsx`) no tiene sistema de tabs hoy — se implementa como una `<section>` más, consistente con el resto de la página (Perfil, Historial, etc.), no como una pestaña literal.

---

### Task 1: Migración — tabla `client_contacts`

**Files:**
- Create: `supabase/migrations/064_client_contacts.sql`
- Modify: `packages/db/src/types/database.ts` (regenerado)

**Interfaces:**
- Produces: tabla `client_contacts`, enum `client_contact_status`, función `current_client_contact_id()`.

- [ ] **Step 1: Escribir la migración**

```sql
-- 064_client_contacts.sql
-- Identidad de contactos de cliente (Portal Cliente), separada por completo
-- del RBAC interno (users/people/user_roles/roles). Ver
-- Docs/superpowers/specs/2026-10-01-portal-cliente-design.md.

create type public.client_contact_status as enum ('invited', 'active', 'disabled');

create table public.client_contacts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null unique,
  status public.client_contact_status not null default 'invited',
  invited_by uuid references public.users(id),
  invited_at timestamptz not null default now(),
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index client_contacts_client_idx on public.client_contacts(client_id);

alter table public.client_contacts enable row level security;

-- Laburu (con permiso client.manage) gestiona contactos de cualquier cliente de su organización.
create policy client_contacts_staff_all on public.client_contacts
  for all using (
    exists (
      select 1 from public.clients c
      where c.id = client_contacts.client_id
        and c.organization_id in (select public.current_user_organization_ids())
    )
    and public.current_user_has_permission('client.manage')
  );

-- El propio contacto puede ver (no editar) su fila.
create policy client_contacts_self_select on public.client_contacts
  for select using (auth_user_id = auth.uid());

-- Helper análogo a current_user_organization_ids(), para RLS futura de
-- Tickets/Parrillas: null si el contacto no existe o está deshabilitado.
create or replace function public.current_client_contact_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select client_id from public.client_contacts
  where auth_user_id = auth.uid() and status = 'active';
$$;
```

- [ ] **Step 2: Aplicar la migración**

```
mcp__supabase__apply_migration(project_id: "hicbkpwywwhnhiawulmu", name: "client_contacts", query: <contenido del archivo>)
```

- [ ] **Step 3: Regenerar tipos TypeScript**

```
mcp__supabase__generate_typescript_types(project_id: "hicbkpwywwhnhiawulmu")
```

Sobreescribir `packages/db/src/types/database.ts` con el resultado completo. Confirmar que `Tables<"client_contacts">` y `Enums<"client_contact_status">` existen.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/064_client_contacts.sql packages/db/src/types/database.ts
git commit -m "feat(portal-cliente): esquema de client_contacts"
```

---

### Task 2: Repositorio `client-contacts.ts`

**Files:**
- Create: `packages/db/src/repositories/client-contacts.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `Db`, `Tables`, `Enums` de `../types/database` (Task 1).
- Produces:
  - `type ClientContactRow = Tables<"client_contacts">`
  - `type ClientContactStatus = Enums<"client_contact_status">`
  - `type ClientContactWithClientName = ClientContactRow & { client: { name: string } | null }`
  - `clientContactEmailExists(db, email): Promise<boolean>`
  - `listClientContactsForClient(db, clientId): Promise<ClientContactRow[]>`
  - `createClientContact(db, values): Promise<ClientContactRow>`
  - `getClientContactByAuthUserId(db, authUserId): Promise<ClientContactWithClientName | null>`
  - `activateClientContact(db, id): Promise<void>`
  - `setClientContactStatus(db, id, status): Promise<void>`

- [ ] **Step 1: Escribir el archivo completo**

```typescript
// packages/db/src/repositories/client-contacts.ts
import type { Enums, Tables } from "../types/database";
import type { Db } from "./shared";

export type ClientContactRow = Tables<"client_contacts">;
export type ClientContactStatus = Enums<"client_contact_status">;
export type ClientContactWithClientName = ClientContactRow & { client: { name: string } | null };

export async function clientContactEmailExists(db: Db, email: string): Promise<boolean> {
  const { data, error } = await db
    .from("client_contacts")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

export async function listClientContactsForClient(db: Db, clientId: string): Promise<ClientContactRow[]> {
  const { data, error } = await db
    .from("client_contacts")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function createClientContact(
  db: Db,
  values: { client_id: string; auth_user_id: string; full_name: string; email: string; invited_by: string },
): Promise<ClientContactRow> {
  const { data, error } = await db.from("client_contacts").insert(values).select("*").single();
  if (error) throw error;
  return data;
}

/** Para resolver la sesión del portal: el contacto + nombre de su cliente. */
export async function getClientContactByAuthUserId(
  db: Db,
  authUserId: string,
): Promise<ClientContactWithClientName | null> {
  const { data, error } = await db
    .from("client_contacts")
    .select("*, client:clients(name)")
    .eq("auth_user_id", authUserId)
    .maybeSingle<ClientContactWithClientName>();
  if (error) throw error;
  return data;
}

export async function activateClientContact(db: Db, id: string): Promise<void> {
  const { error } = await db
    .from("client_contacts")
    .update({ status: "active", activated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export async function setClientContactStatus(db: Db, id: string, status: ClientContactStatus): Promise<void> {
  const { error } = await db.from("client_contacts").update({ status }).eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 2: Exportar desde el índice**

En `packages/db/src/index.ts`, agregar junto a los demás `export *`:

```typescript
export * from "./repositories/client-contacts";
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add packages/db/src/repositories/client-contacts.ts packages/db/src/index.ts
git commit -m "feat(db): repositorio de client_contacts"
```

---

### Task 3: Resolución de sesión del portal + guard cruzado con `(app)`

**Files:**
- Create: `apps/web/lib/portal-auth.ts`
- Modify: `apps/web/lib/auth.ts:36-54` (`getCurrentUser`)
- Modify: `apps/web/app/(app)/layout.tsx:23-26`

**Interfaces:**
- Consumes: `getClientContactByAuthUserId` (Task 2); `getSupabaseServerClient` de `./supabase-server`.
- Produces: `interface CurrentClientContact`, `getCurrentClientContact(): Promise<CurrentClientContact | null>`.

- [ ] **Step 1: Escribir `portal-auth.ts`**

```typescript
// apps/web/lib/portal-auth.ts
import "server-only";
import { cache } from "react";
import { getClientContactByAuthUserId } from "@agency-os/db";
import { getSupabaseServerClient } from "./supabase-server";

export interface CurrentClientContact {
  id: string;
  clientId: string;
  clientName: string;
  fullName: string;
  email: string;
  status: "invited" | "active" | "disabled";
}

// cache(): dedup por request, mismo motivo que getCurrentUser en auth.ts.
export const getCurrentClientContact = cache(async (): Promise<CurrentClientContact | null> => {
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const contact = await getClientContactByAuthUserId(supabase, user.id);
  if (!contact) return null;

  return {
    id: contact.id,
    clientId: contact.client_id,
    clientName: contact.client?.name ?? "",
    fullName: contact.full_name,
    email: contact.email,
    status: contact.status,
  };
});
```

- [ ] **Step 2: Endurecer `getCurrentUser` — sin fila en `users`, no es colaborador interno**

En `apps/web/lib/auth.ts`, dentro de `getCurrentUser` (línea ~45, justo después de obtener `appUser`/`userRoles`), agregar el corte temprano. Antes:

```typescript
  const [{ data: appUser }, { data: userRoles }] = await Promise.all([
    supabase.from("users").select("id, person_id, people(full_name, avatar_url)").eq("id", user.id).single(),
    supabase
      .from("user_roles")
      .select(
        "organization_id, roles(code, name, is_super, module_code, role_permissions(permissions(code)))",
      )
      .eq("user_id", user.id)
      .returns<UserRoleRow[]>(),
  ]);

  const roleRows = (userRoles ?? [])
```

Después (una línea agregada):

```typescript
  const [{ data: appUser }, { data: userRoles }] = await Promise.all([
    supabase.from("users").select("id, person_id, people(full_name, avatar_url)").eq("id", user.id).single(),
    supabase
      .from("user_roles")
      .select(
        "organization_id, roles(code, name, is_super, module_code, role_permissions(permissions(code)))",
      )
      .eq("user_id", user.id)
      .returns<UserRoleRow[]>(),
  ]);

  // Sin fila en `users` → esta sesión no es un colaborador interno (el trigger
  // handle_new_auth_user solo crea `users` para emails @laburuagencia.com) —
  // típicamente un contacto de cliente. No construir un stub: el Portal
  // Cliente depende de que getCurrentUser() devuelva null acá.
  if (!appUser) return null;

  const roleRows = (userRoles ?? [])
```

- [ ] **Step 3: Guard cruzado en `(app)/layout.tsx`**

En `apps/web/app/(app)/layout.tsx`, importar y usar `getCurrentClientContact`. Antes:

```typescript
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { logout } from "@/lib/auth-actions";
```
```typescript
  const user = await getCurrentUser();
  if (!user) redirect("/login");
```

Después:

```typescript
import { getCurrentUser } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentClientContact } from "@/lib/portal-auth";
import { logout } from "@/lib/auth-actions";
```
```typescript
  const user = await getCurrentUser();
  if (!user) {
    const contact = await getCurrentClientContact();
    redirect(contact ? "/portal" : "/login");
  }
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/portal-auth.ts apps/web/lib/auth.ts "apps/web/app/(app)/layout.tsx"
git commit -m "feat(portal-cliente): resolución de sesión del portal y guard cruzado con (app)"
```

---

### Task 4: `/auth/callback` — permitir dominios externos cuando el destino es del portal

**Files:**
- Modify: `apps/web/app/auth/callback/route.ts`

**Interfaces:**
- Consumes: ninguna nueva (usa `isAllowedEmailDomain` ya existente).

El check de dominio (`isAllowedEmailDomain`) hoy bloquea CUALQUIER email no-`@laburuagencia.com`, incluyendo el link de invitación/activación de un contacto de cliente (que redirige acá). Hay que saltarlo cuando `next` apunta al portal — la validación real de un contacto de cliente no es por dominio de email, es por existir en `client_contacts` (Task 3).

- [ ] **Step 1: Editar el route handler**

Archivo completo (reemplaza el actual):

```typescript
// apps/web/app/auth/callback/route.ts
import { NextResponse } from "next/server";
import { isAllowedEmailDomain } from "@agency-os/domain";
import { getSupabaseServerClient } from "@/lib/supabase-server";

// Recibe el `code` del enlace de recuperación/confirmación/OAuth de Supabase
// Auth y lo intercambia por una sesión antes de redirigir (ej. a
// /update-password, /inicio o /portal/activar). El `hd` en el botón de Google
// ya filtra la mayoría de casos, pero la verificación real de dominio ocurre
// acá — salvo que el destino sea el portal, donde la identidad válida es
// `client_contacts`, no el dominio del email (ver 064_client_contacts.sql).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/inicio";
  const isPortalDestination = next.startsWith("/portal");

  if (code) {
    const supabase = await getSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!isPortalDestination && user?.email && !isAllowedEmailDomain(user.email)) {
        await supabase.auth.signOut();
        return NextResponse.redirect(`${origin}/login?error=dominio`);
      }

      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}${isPortalDestination ? "/portal/login" : "/login"}`);
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add "apps/web/app/auth/callback/route.ts"
git commit -m "fix(auth): permite destinos de /portal en el callback sin exigir dominio @laburuagencia.com"
```

---

### Task 5: Server actions de gestión interna (invitar / deshabilitar / reactivar)

**Files:**
- Create: `apps/web/lib/client-contact-actions.ts`

**Interfaces:**
- Consumes: `clientContactEmailExists`, `createClientContact`, `setClientContactStatus`, `getClientById`, `createSupabaseServiceRoleClient` de `@agency-os/db`; `isAllowedEmailDomain` de `@agency-os/domain`; `getCurrentUser`/`hasPermission` de `@/lib/auth`.
- Produces:
  - `type ActionResult = { ok: true; error?: never } | { ok?: never; error: string }`
  - `inviteClientContactAction(clientId: string, fullName: string, email: string): Promise<ActionResult>`
  - `setClientContactStatusAction(contactId: string, status: "active" | "disabled"): Promise<ActionResult>`

- [ ] **Step 1: Escribir el archivo completo**

```typescript
// apps/web/lib/client-contact-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import {
  clientContactEmailExists,
  createClientContact,
  createSupabaseServiceRoleClient,
  getClientById,
  setClientContactStatus,
} from "@agency-os/db";
import { isAllowedEmailDomain } from "@agency-os/domain";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type ActionResult = { ok: true; error?: never } | { ok?: never; error: string };

type ManagerAuth = { organizationId: string; userId: string } | { organizationId?: never; userId?: never; error: string };

async function requireClientManager(): Promise<ManagerAuth> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "client.manage")) {
    return { error: "No tienes permiso para administrar clientes." };
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  return { organizationId, userId: user.id };
}

/** Invita a un contacto de cliente: crea su cuenta de Supabase Auth +
 * la fila en client_contacts. Mismo mecanismo que invitar colaboradores
 * internos (access-actions.ts), pero con redirectTo propio al portal y
 * validando que el email no sea de uso interno. */
export async function inviteClientContactAction(
  clientId: string,
  fullName: string,
  email: string,
): Promise<ActionResult> {
  const auth = await requireClientManager();
  if (auth.error !== undefined) return { error: auth.error };

  const trimmedName = fullName.trim();
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedName || !trimmedEmail) return { error: "Nombre y email son obligatorios." };
  if (isAllowedEmailDomain(trimmedEmail)) {
    return { error: "No se puede invitar un correo @laburuagencia.com como contacto de cliente." };
  }

  try {
    const db = await getSupabaseServerClient();
    const client = await getClientById(db, clientId);
    if (!client || client.organization_id !== auth.organizationId) {
      return { error: "El cliente no existe o no pertenece a tu organización." };
    }
    if (await clientContactEmailExists(db, trimmedEmail)) {
      return { error: `Ya existe un contacto con el correo «${trimmedEmail}».` };
    }

    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
    const service = createSupabaseServiceRoleClient();
    const { data, error } = await service.auth.admin.inviteUserByEmail(trimmedEmail, {
      data: { full_name: trimmedName },
      redirectTo: `${siteUrl}/auth/callback?next=/portal/activar`,
    });
    if (error || !data.user) {
      console.error("inviteClientContactAction:auth", error);
      return { error: "No se pudo invitar al contacto. Verifica el correo e intenta de nuevo." };
    }

    await createClientContact(service, {
      client_id: clientId,
      auth_user_id: data.user.id,
      full_name: trimmedName,
      email: trimmedEmail,
      invited_by: auth.userId,
    });

    revalidatePath(`/crm/clientes/${clientId}`);
    return { ok: true };
  } catch (error) {
    console.error("inviteClientContactAction", error);
    return { error: "No se pudo invitar al contacto. Intenta de nuevo." };
  }
}

/** Deshabilita o reactiva el acceso de un contacto (reversible, sin borrar
 * la cuenta). */
export async function setClientContactStatusAction(
  contactId: string,
  status: "active" | "disabled",
): Promise<ActionResult> {
  const auth = await requireClientManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    await setClientContactStatus(db, contactId, status);
    revalidatePath("/crm/clientes");
    return { ok: true };
  } catch (error) {
    console.error("setClientContactStatusAction", error);
    return { error: "No se pudo actualizar el estado del contacto. Intenta de nuevo." };
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/lib/client-contact-actions.ts
git commit -m "feat(portal-cliente): server actions para invitar y deshabilitar/reactivar contactos"
```

---

### Task 6: UI interna — sección "Portal" en la ficha de cliente

**Files:**
- Create: `apps/web/components/crm/client-contacts-panel.tsx`
- Modify: `apps/web/app/(app)/crm/clientes/[id]/page.tsx`

**Interfaces:**
- Consumes: `listClientContactsForClient` (Task 2); `inviteClientContactAction`/`setClientContactStatusAction` (Task 5).

- [ ] **Step 1: Componente de la sección**

```typescript
// apps/web/components/crm/client-contacts-panel.tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, FieldError, Input, Label } from "@agency-os/ui";
import { inviteClientContactAction, setClientContactStatusAction } from "@/lib/client-contact-actions";

// Nombrado distinto de ClientContactRow (packages/db, snake_case, fila cruda
// de la tabla) a propósito: este es el shape ya mapeado para la UI.
export interface ClientContactListItem {
  id: string;
  fullName: string;
  email: string;
  status: "invited" | "active" | "disabled";
}

const STATUS_LABEL: Record<ClientContactListItem["status"], string> = {
  invited: "Invitado",
  active: "Activo",
  disabled: "Deshabilitado",
};

const STATUS_TONE: Record<ClientContactListItem["status"], "neutral" | "success" | "danger"> = {
  invited: "neutral",
  active: "success",
  disabled: "danger",
};

export function ClientContactsPanel({
  clientId,
  contacts,
}: {
  clientId: string;
  contacts: ClientContactListItem[];
}) {
  const router = useRouter();
  const [inviting, setInviting] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const onInvite = () => {
    setError(null);
    if (!fullName.trim() || !email.trim()) return setError("Nombre y email son obligatorios.");
    startTransition(async () => {
      const result = await inviteClientContactAction(clientId, fullName, email);
      if (result.error) return setError(result.error);
      setFullName("");
      setEmail("");
      setInviting(false);
      router.refresh();
    });
  };

  const onToggleStatus = (contact: ClientContactListItem) => {
    const next = contact.status === "disabled" ? "active" : "disabled";
    startTransition(async () => {
      await setClientContactStatusAction(contact.id, next);
      router.refresh();
    });
  };

  return (
    <section className="rounded-lg border border-line bg-glass p-6 backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold tracking-tight">Portal</h2>
        {!inviting && (
          <Button variant="outline" size="sm" onClick={() => setInviting(true)}>
            + Invitar contacto
          </Button>
        )}
      </div>

      {inviting && (
        <div className="mt-4 space-y-3 rounded-md border border-line bg-surface p-4">
          <div>
            <Label htmlFor="contact-name">Nombre</Label>
            <Input id="contact-name" value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="contact-email">Email</Label>
            <Input id="contact-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <FieldError>{error}</FieldError>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" disabled={isPending} onClick={() => setInviting(false)}>
              Cancelar
            </Button>
            <Button variant="primary" size="sm" disabled={isPending} onClick={onInvite}>
              Invitar
            </Button>
          </div>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {contacts.length === 0 ? (
          <p className="text-sm text-faint">Todavía no hay contactos invitados.</p>
        ) : (
          contacts.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between rounded-md border border-line bg-surface px-4 py-2.5"
            >
              <div>
                <div className="text-sm font-semibold text-ink">{c.fullName}</div>
                <div className="text-xs text-muted">{c.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={STATUS_TONE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                {c.status !== "invited" && (
                  <Button variant="ghost" size="sm" disabled={isPending} onClick={() => onToggleStatus(c)}>
                    {c.status === "disabled" ? "Reactivar" : "Deshabilitar"}
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wirear en la ficha de cliente**

En `apps/web/app/(app)/crm/clientes/[id]/page.tsx`:

```typescript
import { getClientById, listClientContactsForClient, listClientQuotes } from "@agency-os/db";
```
(reemplaza el import existente de `getClientById, listClientQuotes` por esta línea con los tres nombres)

```typescript
import { ClientContactsPanel } from "@/components/crm/client-contacts-panel";
```
(agregar junto a los demás imports de componentes)

```typescript
  const [quotes, statusMap] = await Promise.all([
    listClientQuotes(db, client.id),
    getQuoteStatusMap(db),
  ]);
```
reemplazar por:
```typescript
  const [quotes, statusMap, contacts] = await Promise.all([
    listClientQuotes(db, client.id),
    getQuoteStatusMap(db),
    listClientContactsForClient(db, client.id),
  ]);
```

Y agregar la sección al final del JSX, después de `</section>` del "Historial de cotizaciones" y antes del cierre del `<div>` raíz:

```typescript
      <div className="mt-6">
        <ClientContactsPanel
          clientId={client.id}
          contacts={contacts.map((c) => ({ id: c.id, fullName: c.full_name, email: c.email, status: c.status }))}
        />
      </div>
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/crm/client-contacts-panel.tsx "apps/web/app/(app)/crm/clientes/[id]/page.tsx"
git commit -m "feat(portal-cliente): sección Portal en la ficha de cliente (invitar/deshabilitar contactos)"
```

---

### Task 7: Server actions de auth del portal (login / logout / recuperar / activar)

**Files:**
- Create: `apps/web/lib/portal-actions.ts`
- Modify: `apps/web/lib/auth-actions.ts` (`login`)

**Interfaces:**
- Consumes: `getCurrentClientContact` (Task 3); `getCurrentUser` de `@/lib/auth`; `activateClientContact` de `@agency-os/db`; `AuthActionState` (reusa el tipo ya exportado por `auth-actions.ts`).
- Produces:
  - `portalLogin(prevState, formData): Promise<AuthActionState>`
  - `portalLogout(): Promise<void>`
  - `requestPortalPasswordReset(prevState, formData): Promise<AuthActionState>`
  - `portalSetPassword(prevState, formData): Promise<AuthActionState>`

- [ ] **Step 1: Escribir `portal-actions.ts`**

```typescript
// apps/web/lib/portal-actions.ts
"use server";

import { redirect } from "next/navigation";
import { activateClientContact, createSupabaseServiceRoleClient } from "@agency-os/db";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentClientContact } from "@/lib/portal-auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import type { AuthActionState } from "@/lib/auth-actions";

export async function portalLogin(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Credenciales inválidas" };

  // Cruce de identidad: un colaborador interno no entra por acá.
  const internalUser = await getCurrentUser();
  if (internalUser) {
    await supabase.auth.signOut();
    return { error: "Esta cuenta es de uso interno — ingresa por /login." };
  }

  const contact = await getCurrentClientContact();
  if (!contact) {
    await supabase.auth.signOut();
    return { error: "No encontramos un acceso de cliente para esta cuenta." };
  }
  if (contact.status === "disabled") {
    await supabase.auth.signOut();
    return { error: "Tu acceso fue deshabilitado. Contacta a tu agencia." };
  }

  redirect("/portal");
}

export async function portalLogout() {
  const supabase = await getSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/portal/login");
}

export async function requestPortalPasswordReset(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl}/auth/callback?next=/portal/activar`,
  });
  if (error) return { error: "No se pudo enviar el correo de recuperación" };

  return { error: null, success: true };
}

/** Sirve tanto para activar (primer password tras la invitación) como para
 * completar un reset — mismo patrón que /update-password del lado interno. */
export async function portalSetPassword(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get("password") ?? "");
  if (password.length < 8) {
    return { error: "La contraseña debe tener al menos 8 caracteres" };
  }

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: "No se pudo actualizar la contraseña" };

  const contact = await getCurrentClientContact();
  if (contact && contact.status === "invited") {
    const service = createSupabaseServiceRoleClient();
    await activateClientContact(service, contact.id);
  }

  redirect("/portal");
}
```

- [ ] **Step 2: Cruce de identidad en el login interno**

En `apps/web/lib/auth-actions.ts`, agregar el import y el chequeo simétrico. Antes:

```typescript
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type AuthActionState = { error: string | null; success?: boolean };

export async function login(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Credenciales inválidas" };

  redirect("/inicio");
}
```

Después:

```typescript
import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { getCurrentClientContact } from "@/lib/portal-auth";

export type AuthActionState = { error: string | null; success?: boolean };

export async function login(
  _prevState: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  const supabase = await getSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: "Credenciales inválidas" };

  // Cruce de identidad: un contacto de cliente no entra por acá.
  const contact = await getCurrentClientContact();
  if (contact) {
    await supabase.auth.signOut();
    return { error: "Esta cuenta es de un portal de cliente — ingresa por /portal/login." };
  }

  redirect("/inicio");
}
```

(el resto del archivo — `logout`, `requestPasswordReset`, `updatePassword` — queda igual).

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/lib/portal-actions.ts apps/web/lib/auth-actions.ts
git commit -m "feat(portal-cliente): server actions de login/recuperar/activar del portal"
```

---

### Task 8: UI pública del portal (login / activar / recuperar)

**Files:**
- Create: `apps/web/app/(portal-auth)/layout.tsx`
- Create: `apps/web/app/(portal-auth)/portal/login/page.tsx`
- Create: `apps/web/app/(portal-auth)/portal/activar/page.tsx`
- Create: `apps/web/app/(portal-auth)/portal/recuperar/page.tsx`

**Interfaces:**
- Consumes: `portalLogin`, `requestPortalPasswordReset`, `portalSetPassword` (Task 7).

- [ ] **Step 1: Layout (idéntico al de `(auth)`, sin el botón de Google)**

```typescript
// apps/web/app/(portal-auth)/layout.tsx
"use client";

import { useRef } from "react";

/** Fondo compartido de las vistas de acceso del portal — mismo tratamiento
 * visual que (auth)/layout.tsx, deliberadamente duplicado: son árboles de
 * rutas separados (ver Global Constraints del plan) y este no debe empezar
 * a depender del shell interno. */
export default function PortalAuthLayout({ children }: { children: React.ReactNode }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  const playVideo = () => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = 1.75;
    video.play().catch(() => {});
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#050506] p-4">
      <video
        ref={videoRef}
        muted
        loop
        playsInline
        preload="auto"
        poster="/assets/images/bg-app.png"
        className="absolute inset-0 z-0 h-full w-full object-cover"
      >
        <source src="/assets/videos/bg-app-animado.mp4" type="video/mp4" />
      </video>
      <div className="absolute inset-0 z-[1] bg-[linear-gradient(180deg,rgba(5,5,6,.68),rgba(5,5,6,.9)),radial-gradient(120%_90%_at_80%_10%,rgba(109,40,217,.32),transparent_55%)]" />
      <div className="relative z-[2] w-full max-w-[360px]" onSubmitCapture={playVideo}>
        <div
          className="rounded-[22px] border border-white/15 bg-white/[0.07] p-8 shadow-[0_20px_60px_rgba(0,0,0,.5),inset_0_1px_0_rgba(255,255,255,.08)] backdrop-blur-2xl"
          style={
            {
              "--surface": "rgba(255,255,255,.05)",
              "--border-strong": "rgba(255,255,255,.16)",
              "--text": "#f6f6f7",
            } as React.CSSProperties
          }
        >
          <div className="mb-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/assets/images/logo-Aos.png" alt="Agency OS" className="h-6 w-auto" />
          </div>
          {children}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: `/portal/login`**

```typescript
// apps/web/app/(portal-auth)/portal/login/page.tsx
"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { Button, FieldError, Input, Label } from "@agency-os/ui";
import { portalLogin } from "@/lib/portal-actions";
import type { AuthActionState } from "@/lib/auth-actions";

const initialState: AuthActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-1 w-full">
      {pending ? "Ingresando..." : "Entrar"}
    </Button>
  );
}

export default function PortalLoginPage() {
  const [state, formAction] = useFormState(portalLogin, initialState);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-[#f6f6f7]">Portal de clientes</h1>
        <p className="mt-1 text-[13.5px] text-[#a1a1aa]">Entra a tu espacio con Laburu.</p>
      </div>

      <form action={formAction} className="space-y-4">
        <div>
          <Label htmlFor="email" className="text-[#f6f6f7]">
            Email
          </Label>
          <Input id="email" name="email" type="email" required autoComplete="email" />
        </div>

        <div>
          <Label htmlFor="password" className="text-[#f6f6f7]">
            Contraseña
          </Label>
          <Input id="password" name="password" type="password" required autoComplete="current-password" />
        </div>

        <FieldError>{state.error}</FieldError>

        <SubmitButton />

        <Link
          href="/portal/recuperar"
          className="block text-center text-[12.5px] text-[#71717a] transition hover:text-[#b8ff3c]"
        >
          ¿Olvidaste tu contraseña?
        </Link>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: `/portal/recuperar`**

```typescript
// apps/web/app/(portal-auth)/portal/recuperar/page.tsx
"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { Button, FieldError, Input, Label } from "@agency-os/ui";
import { requestPortalPasswordReset } from "@/lib/portal-actions";
import type { AuthActionState } from "@/lib/auth-actions";

const initialState: AuthActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-1 w-full">
      {pending ? "Enviando..." : "Enviar enlace de recuperación"}
    </Button>
  );
}

export default function PortalResetPasswordPage() {
  const [state, formAction] = useFormState(requestPortalPasswordReset, initialState);

  if (state.success) {
    return (
      <p className="text-center text-sm leading-relaxed text-[#a1a1aa]">
        Si el email existe, te enviamos un enlace para restablecer tu contraseña.
      </p>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-[#f6f6f7]">Recuperar contraseña</h1>
        <p className="mt-1 text-[13.5px] text-[#a1a1aa]">Te enviamos un enlace a tu email.</p>
      </div>

      <div>
        <Label htmlFor="email" className="text-[#f6f6f7]">
          Email
        </Label>
        <Input id="email" name="email" type="email" required autoComplete="email" />
      </div>

      <FieldError>{state.error}</FieldError>

      <SubmitButton />

      <Link
        href="/portal/login"
        className="block text-center text-[12.5px] text-[#71717a] transition hover:text-[#b8ff3c]"
      >
        Volver a login
      </Link>
    </form>
  );
}
```

- [ ] **Step 4: `/portal/activar`**

```typescript
// apps/web/app/(portal-auth)/portal/activar/page.tsx
"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button, FieldError, Input, Label } from "@agency-os/ui";
import { portalSetPassword } from "@/lib/portal-actions";
import type { AuthActionState } from "@/lib/auth-actions";

const initialState: AuthActionState = { error: null };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="mt-1 w-full">
      {pending ? "Guardando..." : "Guardar contraseña"}
    </Button>
  );
}

export default function PortalActivarPage() {
  const [state, formAction] = useFormState(portalSetPassword, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <h1 className="text-[22px] font-bold tracking-tight text-[#f6f6f7]">Activa tu cuenta</h1>
        <p className="mt-1 text-[13.5px] text-[#a1a1aa]">Define tu contraseña para entrar al portal.</p>
      </div>

      <div>
        <Label htmlFor="password" className="text-[#f6f6f7]">
          Contraseña
        </Label>
        <Input id="password" name="password" type="password" required minLength={8} autoComplete="new-password" />
      </div>

      <FieldError>{state.error}</FieldError>

      <SubmitButton />
    </form>
  );
}
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add "apps/web/app/(portal-auth)"
git commit -m "feat(portal-cliente): páginas públicas de login/recuperar/activar"
```

---

### Task 9: Shell autenticado `/portal`

**Files:**
- Create: `apps/web/app/(portal)/portal/layout.tsx`
- Create: `apps/web/app/(portal)/portal/page.tsx`

**Interfaces:**
- Consumes: `getCurrentClientContact` (Task 3); `getCurrentUser` de `@/lib/auth`; `portalLogout` (Task 7).

- [ ] **Step 1: Layout con el guard cruzado**

```typescript
// apps/web/app/(portal)/portal/layout.tsx
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { getCurrentClientContact } from "@/lib/portal-auth";
import { portalLogout } from "@/lib/portal-actions";

export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const contact = await getCurrentClientContact();
  if (!contact) {
    const internalUser = await getCurrentUser();
    redirect(internalUser ? "/inicio" : "/portal/login");
  }
  if (contact.status === "disabled") redirect("/portal/login");

  return (
    <div className="min-h-screen bg-[#050506] text-[#f6f6f7]">
      <header className="flex items-center justify-between border-b border-white/10 px-8 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/assets/images/logo-Aos.png" alt="Agency OS" className="h-5 w-auto" />
        <div className="flex items-center gap-3 text-sm">
          <span className="text-[#a1a1aa]">{contact.clientName}</span>
          <form action={portalLogout}>
            <button
              type="submit"
              className="cursor-pointer rounded-pill border border-white/15 px-3.5 py-2 text-xs font-semibold transition hover:border-[#b8ff3c]"
            >
              Salir
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-[1000px] px-8 py-10">{children}</main>
    </div>
  );
}
```

- [ ] **Step 2: Home vacío**

```typescript
// apps/web/app/(portal)/portal/page.tsx
import { getCurrentClientContact } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export default async function PortalHomePage() {
  const contact = await getCurrentClientContact();

  return (
    <div>
      <h1 className="text-2xl font-bold tracking-tight">Hola, {contact?.fullName}</h1>
      <p className="mt-2 text-sm text-[#a1a1aa]">
        Todavía no hay nada para mostrar acá — pronto vas a poder ver tus tickets y el contenido de
        tus redes directamente desde este portal.
      </p>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add "apps/web/app/(portal)"
git commit -m "feat(portal-cliente): shell autenticado /portal (vacío)"
```

- [ ] **Step 5: Validación manual (checklist para Yesid)**

No hay forma de probar un flujo de invitación por email + login real con tests automatizados sin un proveedor de correo de prueba — queda para QA manual en navegador:

1. Invitar un contacto desde `/crm/clientes/[id]` → llega el email de invitación.
2. Abrir el link → cae en `/portal/activar` (no en `/login?error=dominio`) → definir contraseña → termina en `/portal` ("Hola, {nombre}").
3. Intentar entrar a `/login` (interno) con ese mismo email/contraseña → rechazado con el mensaje de "cuenta de portal de cliente".
4. Intentar entrar a `/portal/login` con un email/contraseña de un colaborador interno real → rechazado con el mensaje de "cuenta de uso interno".
5. Deshabilitar el contacto desde `/crm/clientes/[id]` → el contacto ya no puede entrar a `/portal/login` (mensaje de acceso deshabilitado) ni acceder a `/portal` si ya tenía sesión abierta (recarga y lo saca).
6. Reactivar el contacto → vuelve a poder entrar.
