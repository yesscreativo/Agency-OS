# Visibilidad de cliente para el Gantt (Fase 2 de 2) — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir marcar comentarios/adjuntos como "visibles para cliente" y generar un link público de solo lectura por proyecto que muestra el Gantt de la Fase 1 más ese contenido marcado — sin login, sin tocar Portal Cliente (V2, sigue sin construir).

**Architecture:** Reusa `work_item_comments.visibility` (ya existe) y agrega el mismo campo a `work_item_attachments`. Una tabla nueva `work_item_share_links` guarda un token por proyecto. La ruta pública resuelve el token con el cliente `service_role` (mismo patrón que `(public)/proveedor/[token]`), arma un DTO explícito y renderiza el mismo `ProjectGantt` de la Fase 1 en modo `canManage={false}`.

**Tech Stack:** Igual que Fase 1 — Next.js/TypeScript/Tailwind, Supabase. Sin dependencias nuevas.

## Global Constraints

- **Depende de la Fase 1** (`2026-09-30-gantt-interno-plan.md`) — requiere `ProjectGantt`, `GanttTask`, `GanttDependency`, `listGanttTasks`, `listDependenciesForProject` ya implementados.
- El link público **nunca** muta datos — toda acción de la ruta pública es de solo lectura.
- El link **no expira** por tiempo — solo se invalida con `revoked_at` (botón "Revocar", `project.manage`).
- Generar el link es una acción explícita, separada de activar el Gantt (Fase 1) — activar el Gantt no comparte nada automáticamente.
- El cliente solo ve comentarios/adjuntos con `visibility = 'client_visible'` — nunca los `'internal'` (default).
- Reutiliza permisos existentes (`project.view`, `project.manage`, y "puede comentar" = cualquiera con acceso al proyecto) — sin permisos nuevos.
- Copy en español; `snake_case` en DB.

---

### Task 1: Migración — `visibility` en `work_item_attachments`

**Files:**
- Create: `supabase/migrations/058_work_item_attachments_visibility.sql`

**Interfaces:**
- Produces: `work_item_attachments.visibility text not null default 'internal'` (con check `in ('internal','client_visible')`), consumida por Task 3-6.

- [ ] **Step 1: Escribir la migración**

```sql
-- 058_work_item_attachments_visibility.sql
-- Paridad con work_item_comments.visibility (023_work_item_comments_activity.sql):
-- permite marcar un adjunto como visible para el cliente en el link público
-- del Gantt (ver Docs/superpowers/specs/2026-09-30-gantt-proyectos-design.md §6).

alter table public.work_item_attachments add column visibility text not null default 'internal';
alter table public.work_item_attachments add constraint work_item_attachments_visibility_check
  check (visibility in ('internal', 'client_visible'));
```

- [ ] **Step 2: Aplicar y regenerar tipos**

```
mcp__supabase__apply_migration(name: "work_item_attachments_visibility", query: <contenido>)
mcp__supabase__generate_typescript_types()
```

Sobreescribir `packages/db/src/types/database.ts` con el resultado. Confirmar que `Tables<"work_item_attachments">` incluye `visibility: string`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/058_work_item_attachments_visibility.sql packages/db/src/types/database.ts
git commit -m "feat(proyectos): columna visibility en work_item_attachments"
```

---

### Task 2: Migración — `work_item_share_links`

**Files:**
- Create: `supabase/migrations/059_work_item_share_links.sql`

**Interfaces:**
- Produces: tabla `work_item_share_links` (`id`, `organization_id`, `project_id` único, `token`, `revoked_at`, `created_by`, `created_at`), consumida por Task 3.

- [ ] **Step 1: Escribir la migración**

```sql
-- 059_work_item_share_links.sql
-- Link público de solo lectura del Gantt, uno por proyecto. Sin expires_at a
-- propósito (un proyecto dura semanas/meses, no como un link de cotización de
-- 5 días) — se invalida solo con revoked_at. Mismo patrón de token que
-- quote_recipients/supplier_orders (002_crm.sql).

create table public.work_item_share_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  project_id uuid not null unique references public.work_items(id) on delete cascade,
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  revoked_at timestamptz,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now()
);

alter table public.work_item_share_links enable row level security;

create policy work_item_share_links_select on public.work_item_share_links
  for select using (organization_id in (select public.current_user_organization_ids()));
create policy work_item_share_links_write on public.work_item_share_links
  for all using (
    organization_id in (select public.current_user_organization_ids())
    and public.current_user_has_permission('project.manage')
  );
```

Nota: la ruta pública **no** usa estas policies — resuelve el token con `service_role` (bypassea RLS), igual que `getSupplierOrderByToken` en `(public)/proveedor/[token]`. Las policies de arriba solo rigen el acceso autenticado normal (generar/revocar desde `/proyectos`).

- [ ] **Step 2: Aplicar y regenerar tipos**

```
mcp__supabase__apply_migration(name: "work_item_share_links", query: <contenido>)
mcp__supabase__generate_typescript_types()
```

Sobreescribir `packages/db/src/types/database.ts`.

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/059_work_item_share_links.sql packages/db/src/types/database.ts
git commit -m "feat(proyectos): tabla work_item_share_links con RLS"
```

---

### Task 3: Repositorios

**Files:**
- Create: `packages/db/src/repositories/work-item-share-links.ts`
- Modify: `packages/db/src/repositories/work-item-comments.ts`
- Modify: `packages/db/src/repositories/work-item-attachments.ts`
- Modify: `packages/db/src/index.ts`

**Interfaces:**
- Produces:
  - `type ShareLinkRow = Tables<"work_item_share_links">`
  - `getShareLinkByProject(db: Db, projectId: string): Promise<ShareLinkRow | null>`
  - `getShareLinkByToken(db: Db, token: string): Promise<ShareLinkRow | null>`
  - `createShareLink(db: Db, values: { organizationId: string; projectId: string; createdBy: string }): Promise<ShareLinkRow>`
  - `revokeShareLink(db: Db, id: string): Promise<void>`
  - `listClientVisibleCommentsForProject(db: Db, projectId: string): Promise<CommentWithAuthor[]>`
  - `listClientVisibleAttachmentsForProject(db: Db, projectId: string): Promise<AttachmentRow[]>`

- [ ] **Step 1: Repo de share links**

```typescript
// packages/db/src/repositories/work-item-share-links.ts
import type { Tables } from "../types/database";
import type { Db } from "./shared";

export type ShareLinkRow = Tables<"work_item_share_links">;

export async function getShareLinkByProject(db: Db, projectId: string): Promise<ShareLinkRow | null> {
  const { data, error } = await db
    .from("work_item_share_links")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** Resuelve por token — usado por la ruta pública con `service_role`. */
export async function getShareLinkByToken(db: Db, token: string): Promise<ShareLinkRow | null> {
  const { data, error } = await db.from("work_item_share_links").select("*").eq("token", token).maybeSingle();
  if (error) throw error;
  return data;
}

export async function createShareLink(
  db: Db,
  values: { organizationId: string; projectId: string; createdBy: string },
): Promise<ShareLinkRow> {
  const { data, error } = await db
    .from("work_item_share_links")
    .insert({ organization_id: values.organizationId, project_id: values.projectId, created_by: values.createdBy })
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

export async function revokeShareLink(db: Db, id: string): Promise<void> {
  const { error } = await db
    .from("work_item_share_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}
```

- [ ] **Step 2: Agregar a `work-item-comments.ts`**

Agregar al final del archivo (reusa `COMMENT_SELECT`/`toComment`/`CommentSelectRow` ya definidos arriba en el mismo archivo):

```typescript
/** Comentarios `client_visible` de TODOS los work items de un proyecto (para
 * la ruta pública del Gantt). Embebe `work_items!inner` para filtrar por
 * `project_id` server-side — a diferencia de otros lugares del repo que
 * escanean y filtran en memoria, acá SÍ hay FK directa
 * (`work_item_comments.work_item_id -> work_items.id`), así que el embed con
 * filtro funciona sin ambigüedad. */
export async function listClientVisibleCommentsForProject(
  db: Db,
  projectId: string,
): Promise<CommentWithAuthor[]> {
  const { data, error } = await db
    .from("work_item_comments")
    .select(`${COMMENT_SELECT}, work_item:work_items!inner(project_id)`)
    .eq("work_item.project_id", projectId)
    .eq("visibility", "client_visible")
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .returns<(CommentSelectRow & { work_item: { project_id: string } })[]>();
  if (error) throw error;
  return (data ?? []).map(toComment);
}
```

- [ ] **Step 3: Agregar a `work-item-attachments.ts`**

```typescript
/** Adjuntos `client_visible` de TODOS los work items de un proyecto (para la
 * ruta pública del Gantt). Mismo motivo de embed que
 * `listClientVisibleCommentsForProject`. */
export async function listClientVisibleAttachmentsForProject(
  db: Db,
  projectId: string,
): Promise<AttachmentRow[]> {
  const { data, error } = await db
    .from("work_item_attachments")
    .select("*, work_item:work_items!inner(project_id)")
    .eq("work_item.project_id", projectId)
    .eq("visibility", "client_visible")
    .order("created_at", { ascending: true })
    .returns<(AttachmentRow & { work_item: { project_id: string } })[]>();
  if (error) throw error;
  return data ?? [];
}
```

- [ ] **Step 4: Exportar desde el índice**

En `packages/db/src/index.ts`, agregar:

```typescript
export * from "./repositories/work-item-share-links";
```

(`work-item-comments`/`work-item-attachments` ya están exportados — las funciones nuevas salen con el `export *` existente.)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @agency-os/db typecheck`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add packages/db/src/repositories/work-item-share-links.ts packages/db/src/repositories/work-item-comments.ts packages/db/src/repositories/work-item-attachments.ts packages/db/src/index.ts
git commit -m "feat(db): repos de share links y contenido visible-para-cliente"
```

---

### Task 4: Server actions — visibilidad y link

**Files:**
- Modify: `apps/web/lib/project-actions.ts` (visibilidad de adjuntos)
- Modify: `apps/web/lib/work-item-comment-actions.ts` (visibilidad de comentarios)
- Create: `apps/web/lib/client-share-actions.ts` (generar/revocar link)

**Interfaces:**
- Consumes: `getShareLinkByProject`, `createShareLink`, `revokeShareLink` (Task 3); `requireProjectManager`-equivalent.
- Produces:
  - `WorkItemAttachment.isClientVisible: boolean` (campo nuevo en el tipo existente)
  - `uploadWorkItemAttachment(workItemId, formData)` — sin cambio de firma, lee `formData.get("visibility")`
  - `CreateCommentInput.visibility?: 'internal' | 'client_visible'`
  - `generateShareLinkAction(projectId: string): Promise<{ token: string; error?: never } | { token?: never; error: string }>`
  - `revokeShareLinkAction(projectId: string): Promise<ActionResult>`
  - `getShareLinkAction(projectId: string): Promise<{ token: string | null; error?: never } | { token?: never; error: string }>`

- [ ] **Step 1: Adjuntos — leer visibilidad del FormData**

En `apps/web/lib/project-actions.ts`, modificar `toAttachment` para incluir el campo:

```typescript
export interface WorkItemAttachment {
  id: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  url: string | null;
  isClientVisible: boolean;
}

function toAttachment(row: AttachmentRow, url: string | null): WorkItemAttachment {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    url,
    isClientVisible: row.visibility === "client_visible",
  };
}
```

En `uploadWorkItemAttachment`, leer el flag del FormData y pasarlo al insert (agregar la línea marcada, sin tocar el resto de la función):

```typescript
    const shareWithClient = formData.get("visibility") === "client_visible";
    const row = await insertAttachment(db, {
      work_item_id: workItemId,
      organization_id: auth.organizationId,
      path,
      filename: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      created_by: auth.userId,
      visibility: shareWithClient ? "client_visible" : "internal",
    });
```

Hacer el mismo cambio (leer `formData.get("visibility")`, pasar `visibility` al `insertAttachment`) en `uploadCommentAttachment`, más abajo en el mismo archivo.

- [ ] **Step 2: Comentarios — aceptar visibilidad**

En `apps/web/lib/work-item-comment-actions.ts`, extender `CreateCommentInput` y el insert:

```typescript
export interface CreateCommentInput {
  workItemId: string;
  body: string;
  parentCommentId?: string | null;
  /** true si el equipo lo marca "compartir con cliente". Default 'internal'. */
  visibleToClient?: boolean;
}
```

```typescript
    const comment = await insertComment(db, {
      organization_id: auth.organizationId,
      work_item_id: input.workItemId,
      parent_comment_id: input.parentCommentId ?? null,
      author_user_id: auth.user.id,
      body,
      mentioned_user_ids: mentionedIds,
      visibility: input.visibleToClient ? "client_visible" : "internal",
    });
```

- [ ] **Step 3: Acción de generar/revocar link**

```typescript
// apps/web/lib/client-share-actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createShareLink, getShareLinkByProject, revokeShareLink, type Db } from "@agency-os/db";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { resolveProjectLink } from "@/lib/resolve-task-link";

export type ActionResult = { ok: true; error?: never } | { ok?: never; error: string };
export type TokenResult = { token: string | null; error?: never } | { token?: never; error: string };

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

async function assertProjectInOrg(db: Db, projectId: string, organizationId: string): Promise<boolean> {
  const { data, error } = await db
    .from("work_items")
    .select("organization_id, type")
    .eq("id", projectId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data && data.organization_id === organizationId && data.type === "project");
}

/** Token vigente del proyecto, si ya se generó uno (y no está revocado). */
export async function getShareLinkAction(projectId: string): Promise<TokenResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    if (!(await assertProjectInOrg(db, projectId, auth.organizationId))) {
      return { error: "El proyecto no existe o no pertenece a tu organización." };
    }
    const link = await getShareLinkByProject(db, projectId);
    return { token: link && !link.revoked_at ? link.token : null };
  } catch (error) {
    console.error("getShareLinkAction", error);
    return { error: "No se pudo consultar el link." };
  }
}

/** Genera el link público. Si ya existe uno revocado, lo reemplaza por uno
 * nuevo en vez de acumular filas (un proyecto tiene a lo sumo un link vigente
 * por el `unique(project_id)` de la migración). */
export async function generateShareLinkAction(projectId: string): Promise<TokenResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    if (!(await assertProjectInOrg(db, projectId, auth.organizationId))) {
      return { error: "El proyecto no existe o no pertenece a tu organización." };
    }

    const existing = await getShareLinkByProject(db, projectId);
    if (existing && !existing.revoked_at) return { token: existing.token };
    if (existing && existing.revoked_at) {
      // Reemplaza el registro revocado (unique(project_id) no permite un segundo insert).
      const { error: deleteError } = await db.from("work_item_share_links").delete().eq("id", existing.id);
      if (deleteError) throw deleteError;
    }

    const created = await createShareLink(db, {
      organizationId: auth.organizationId,
      projectId,
      createdBy: auth.userId,
    });
    const link = await resolveProjectLink(db, projectId);
    if (link) revalidatePath(link);
    return { token: created.token };
  } catch (error) {
    console.error("generateShareLinkAction", error);
    return { error: "No se pudo generar el link. Intenta de nuevo." };
  }
}

export async function revokeShareLinkAction(projectId: string): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    if (!(await assertProjectInOrg(db, projectId, auth.organizationId))) {
      return { error: "El proyecto no existe o no pertenece a tu organización." };
    }
    const existing = await getShareLinkByProject(db, projectId);
    if (!existing) return { ok: true };
    await revokeShareLink(db, existing.id);
    const link = await resolveProjectLink(db, projectId);
    if (link) revalidatePath(link);
    return { ok: true };
  } catch (error) {
    console.error("revokeShareLinkAction", error);
    return { error: "No se pudo revocar el link. Intenta de nuevo." };
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/project-actions.ts apps/web/lib/work-item-comment-actions.ts apps/web/lib/client-share-actions.ts
git commit -m "feat(proyectos): visibilidad de cliente en comentarios/adjuntos + acciones de link público"
```

---

### Task 5: UI — marcar comentarios como visibles para cliente

**Files:**
- Modify: `apps/web/components/proyectos/work-item-activity-panel.tsx`
- Modify: `apps/web/app/(app)/proyectos/[cliente]/[proyecto]/tareas/[tarea]/page.tsx`

**Interfaces:**
- Consumes: `createComment` con `visibleToClient` (Task 4).
- Produces: `PanelComment.visibleToClient: boolean`, badge visual "Cliente" en el hilo.

- [ ] **Step 1: Checkbox en `CommentComposer`**

Agregar el campo al estado y al callback (`onSubmit`) del composer:

```typescript
  onSubmit: (body: string, files: File[], visibleToClient: boolean) => void;
```

Agregar el estado junto a los demás (`const [files, setFiles] = useState<File[]>([]);`):

```typescript
  const [visibleToClient, setVisibleToClient] = useState(false);
```

En `submit`, incluirlo y resetear:

```typescript
  const submit = () => {
    if (!canSubmit) return;
    onSubmit(body.trim(), files, visibleToClient);
    setBody("");
    setFiles([]);
    setFileError(null);
    setVisibleToClient(false);
  };
```

Agregar el checkbox junto a los botones de la barra inferior (donde está el botón `submitLabel`):

```typescript
      <div className="mt-2 flex items-center gap-3">
        <Button variant="primary" size="sm" disabled={!canSubmit} onClick={submit}>
          {submitLabel}
        </Button>
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={visibleToClient}
            onChange={(e) => setVisibleToClient(e.target.checked)}
          />
          Compartir con cliente
        </label>
        {/* ...botón de adjuntar archivo existente sigue igual a continuación... */}
```

- [ ] **Step 2: Propagar en `submitComment` y mostrar el badge**

Modificar `submitComment` (recibe el tercer parámetro) y sus dos usos:

```typescript
  const submitComment = (body: string, files: File[], parentCommentId: string | null, visibleToClient: boolean) => {
    setError(null);
    startTransition(async () => {
      const res = await createComment({ workItemId, body, parentCommentId, visibleToClient });
      // ...resto sin cambios...
```

```typescript
          <CommentComposer users={orgUsers} onSubmit={(b, files, v) => submitComment(b, files, null, v)} />
```

```typescript
                        onSubmit={(b, files, v) => submitComment(b, files, root.id, v)}
```

Agregar `visibleToClient` a `PanelComment`:

```typescript
export interface PanelComment {
  id: string;
  parentId: string | null;
  authorId: string;
  authorName: string;
  body: string;
  createdAt: string;
  editedAt: string | null;
  attachments: WorkItemAttachment[];
  visibleToClient: boolean;
}
```

Renderizar el badge donde se pinta cada comentario (buscar el bloque que muestra `authorName`/`createdAt` de cada comentario raíz/reply y agregar junto a la fecha):

```typescript
              {c.visibleToClient && <Badge tone="info">Cliente</Badge>}
```

(Ajustar el import de `Badge` desde `@agency-os/ui` si el archivo no lo importa ya.)

- [ ] **Step 3: Mapear en la página de detalle de tarea**

En `apps/web/app/(app)/proyectos/[cliente]/[proyecto]/tareas/[tarea]/page.tsx`, agregar el campo al `.map`:

```typescript
  const comments = commentRows.map((c) => ({
    id: c.id,
    parentId: c.parent_comment_id,
    authorId: c.author_user_id,
    authorName: c.author?.full_name ?? "—",
    body: c.body,
    createdAt: c.created_at,
    editedAt: c.edited_at,
    attachments: attachmentsByComment.get(c.id) ?? [],
    visibleToClient: c.visibility === "client_visible",
  }));
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/proyectos/work-item-activity-panel.tsx "apps/web/app/(app)/proyectos/[cliente]/[proyecto]/tareas/[tarea]/page.tsx"
git commit -m "feat(proyectos): toggle y badge de comentario visible para cliente"
```

---

### Task 6: UI — marcar adjuntos como visibles para cliente

**Files:**
- Modify: `apps/web/components/proyectos/work-item-detail.tsx`

**Interfaces:**
- Consumes: `uploadWorkItemAttachment` leyendo `visibility` del FormData (Task 4), `WorkItemAttachment.isClientVisible` (Task 4).

Alcance: solo la vista full-screen de tarea (`work-item-detail.tsx`), que es donde se gestionan adjuntos día a día (ver comentario ya existente en `project-board.tsx`: "Editar una tarea ya NO usa el modal: navega a la ruta full-screen"). El modal de creación rápida (`work-item-editor.tsx`) sigue subiendo adjuntos como `internal` por defecto — no es una regresión (es el comportamiento actual), solo queda fuera de esta pasada; se puede sumar después si hace falta.

- [ ] **Step 1: Checkbox junto al selector de archivo**

Agregar el estado junto a los demás de adjuntos:

```typescript
  const [shareAttachmentsWithClient, setShareAttachmentsWithClient] = useState(false);
```

Modificar `onFilesSelected` para incluir el flag en cada `FormData`:

```typescript
    startTransition(async () => {
      for (const file of list) {
        const fd = new FormData();
        fd.append("file", file);
        if (shareAttachmentsWithClient) fd.append("visibility", "client_visible");
        const res = await uploadWorkItemAttachment(task.id, fd);
        if (res.error || !res.attachment) {
          setAttachmentError(res.error ?? "No se pudo subir el archivo.");
          break;
        }
        const uploaded = res.attachment;
        setAttachments((prev) => [...prev, uploaded]);
      }
      setAttachmentBusy(false);
    });
```

Agregar el checkbox junto al botón/input de subir archivo (buscar el `<input ref={fileInputRef} type="file" ...>` existente y agregar antes o después):

```typescript
        <label className="flex items-center gap-1.5 text-xs text-muted">
          <input
            type="checkbox"
            checked={shareAttachmentsWithClient}
            onChange={(e) => setShareAttachmentsWithClient(e.target.checked)}
          />
          Compartir con cliente
        </label>
```

- [ ] **Step 2: Badge en la lista de adjuntos**

Donde se renderiza cada `AttachmentCard` (buscar `attachments.map`), agregar el badge si `isClientVisible`:

```typescript
{attachments.map((a) => (
  <AttachmentCard key={a.id} attachment={a} onRemove={() => removeAttachment(a.id)}>
    {a.isClientVisible && <Badge tone="info">Cliente</Badge>}
  </AttachmentCard>
))}
```

(Si `AttachmentCard` no acepta `children`, revisar su firma en `work-item-fields.tsx` y agregar un prop `badge?: React.ReactNode` en vez de `children` — mantener el resto del componente intacto.)

- [ ] **Step 3: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/proyectos/work-item-detail.tsx apps/web/components/proyectos/work-item-fields.tsx
git commit -m "feat(proyectos): toggle y badge de adjunto visible para cliente"
```

---

### Task 7: UI — generar/copiar/revocar link en el proyecto

**Files:**
- Modify: `apps/web/components/proyectos/project-board.tsx`

**Interfaces:**
- Consumes: `getShareLinkAction`, `generateShareLinkAction`, `revokeShareLinkAction` (Task 4).

- [ ] **Step 1: Estado y controles en la pestaña Gantt**

En `project-board.tsx`, agregar el import y el estado (junto a los demás `useState` del componente):

```typescript
import { generateShareLinkAction, getShareLinkAction, revokeShareLinkAction } from "@/lib/client-share-actions";
```

```typescript
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [shareBusy, setShareBusy] = useState(false);
```

Cargar el token vigente al entrar a la pestaña Gantt (efecto disparado por `view`):

```typescript
  useEffect(() => {
    if (view !== "gantt" || !ganttEnabled) return;
    let cancelled = false;
    void getShareLinkAction(projectId).then((res) => {
      if (!cancelled && res.token !== undefined) setShareToken(res.token);
    });
    return () => {
      cancelled = true;
    };
  }, [view, ganttEnabled, projectId]);
```

Agregar los controles dentro de la rama `view === "gantt"` del render (antes de `<ProjectGantt ... />`, dentro del mismo bloque condicional creado en la Fase 1):

```typescript
      ) : view === "gantt" ? (
        <>
          {canManage && (
            <div className="mb-3 flex items-center justify-end gap-2">
              {shareToken ? (
                <>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(`${window.location.origin}/proyecto/${shareToken}`);
                    }}
                  >
                    Copiar link
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={shareBusy}
                    onClick={() => {
                      setShareBusy(true);
                      void revokeShareLinkAction(projectId).then((res) => {
                        setShareBusy(false);
                        if (!res.error) setShareToken(null);
                      });
                    }}
                  >
                    Revocar link
                  </Button>
                </>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={shareBusy}
                  onClick={() => {
                    setShareBusy(true);
                    void generateShareLinkAction(projectId).then((res) => {
                      setShareBusy(false);
                      if (res.token) setShareToken(res.token);
                    });
                  }}
                >
                  Generar link
                </Button>
              )}
            </div>
          )}
          <ProjectGantt
            projectId={projectId}
            tasks={ganttTasks}
            dependencies={ganttDependencies}
            statuses={statuses}
            orgUsers={orgUsers}
            canManage={canManage}
          />
        </>
      ) : (
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/proyectos/project-board.tsx
git commit -m "feat(proyectos): generar/copiar/revocar link publico del Gantt"
```

---

### Task 8: Ruta pública `(public)/proyecto/[token]`

**Files:**
- Create: `apps/web/app/(public)/proyecto/[token]/page.tsx`

**Interfaces:**
- Consumes: `createSupabaseServiceRoleClient`, `getShareLinkByToken`, `getProject`, `listGanttTasks`, `listDependenciesForProject`, `listClientVisibleCommentsForProject`, `listClientVisibleAttachmentsForProject` (Task 3, `@agency-os/db`); `ProjectGantt`/`GanttTask`/`GanttDependency` (Fase 1).

- [ ] **Step 1: Escribir la página**

```typescript
// apps/web/app/(public)/proyecto/[token]/page.tsx
import { notFound } from "next/navigation";
import {
  createSupabaseServiceRoleClient,
  getProject,
  getShareLinkByToken,
  listClientVisibleAttachmentsForProject,
  listClientVisibleCommentsForProject,
  listDependenciesForProject,
  listGanttTasks,
} from "@agency-os/db";
import { formatDate } from "@agency-os/domain";
import { ProjectGantt, type GanttDependency } from "@/components/proyectos/project-gantt";
import type { GanttTask } from "@/components/proyectos/gantt-task-modal";

export const dynamic = "force-dynamic";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto max-w-[560px] px-6 py-20 text-center sm:px-10">
      <h1 className="text-xl font-bold">{title}</h1>
      <p className="mt-2 text-sm text-[#71717a]">{body}</p>
    </main>
  );
}

/** Vista pública de solo lectura del Gantt de un proyecto, por link con token
 * (sin login — Portal Cliente sigue sin construir, ver spec). Se resuelve
 * server-side con `service_role`, igual que `(public)/proveedor/[token]`. */
export default async function PublicProjectGanttPage({ params }: { params: { token: string } }) {
  const db = createSupabaseServiceRoleClient();
  const link = await getShareLinkByToken(db, params.token);
  if (!link) notFound();

  if (link.revoked_at) {
    return (
      <Notice
        title="Este enlace ya no está disponible"
        body="Contacta a tu equipo de Laburu Agency para que te compartan uno nuevo."
      />
    );
  }

  const project = await getProject(db, link.project_id);
  if (!project) notFound();

  const [ganttTaskRows, dependencyRows, comments, attachments] = await Promise.all([
    listGanttTasks(db, link.project_id),
    listDependenciesForProject(db, link.project_id),
    listClientVisibleCommentsForProject(db, link.project_id),
    listClientVisibleAttachmentsForProject(db, link.project_id),
  ]);

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

  const attachmentPaths = attachments.map((a) => a.path);
  const { data: signedUrls } = attachmentPaths.length
    ? await db.storage.from("work-item-files").createSignedUrls(attachmentPaths, 60 * 60)
    : { data: [] as { path: string | null; signedUrl: string }[] };
  const urlByPath = new Map((signedUrls ?? []).map((u) => [u.path, u.signedUrl]));

  return (
    <main className="mx-auto max-w-[1100px] px-6 py-10 font-sans sm:px-10">
      <div className="mb-8">
        <div className="font-mono text-sm font-bold">{project.client?.name ?? ""}</div>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{project.title}</h1>
      </div>

      <ProjectGantt
        projectId={project.id}
        tasks={ganttTasks}
        dependencies={ganttDependencies}
        statuses={project.statuses.map((s) => ({ id: s.id, label: s.label, color: s.color, isDone: s.is_done }))}
        orgUsers={[]}
        canManage={false}
      />

      {(comments.length > 0 || attachments.length > 0) && (
        <div className="mt-8 rounded-lg border border-[#e4e4e7] bg-white p-5 sm:p-7">
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wider text-[#71717a]">Actualizaciones</h2>
          <div className="space-y-4">
            {comments.map((c) => (
              <div key={c.id} className="border-b border-[#e4e4e7] pb-3 last:border-0">
                <div className="text-xs text-[#a1a1aa]">
                  {c.author?.full_name ?? "Equipo"} · {formatDate(c.created_at)}
                </div>
                <p className="mt-1 whitespace-pre-line text-sm text-[#161618]">{c.body}</p>
              </div>
            ))}
            {attachments.map((a) => {
              const url = urlByPath.get(a.path);
              return url ? (
                <a
                  key={a.id}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="block text-sm text-[#378add] underline"
                >
                  {a.filename}
                </a>
              ) : null;
            })}
          </div>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-[#a1a1aa]">Laburu Agency</p>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter web typecheck`
Expected: sin errores.

- [ ] **Step 3: Build**

Run: `pnpm --filter web build`
Expected: build exitoso.

- [ ] **Step 4: Verificación manual (Yesid en el navegador)**

1. En un proyecto con Gantt activado y con tareas, ir a la pestaña Gantt y generar el link.
2. Abrir el link en una ventana de incógnito (sin sesión) → se ve el Gantt en modo lectura, sin poder arrastrar ni editar.
3. Marcar un comentario y un adjunto como "Compartir con cliente" → confirmar que aparecen en el link público; marcar otros como internos → confirmar que NO aparecen.
4. Revocar el link → recargar la URL pública → debe mostrar "Este enlace ya no está disponible".
5. Generar un link nuevo tras revocar el anterior → confirmar que el token viejo ya no funciona y el nuevo sí.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/app/(public)/proyecto/[token]/page.tsx"
git commit -m "feat(proyectos): vista publica de solo lectura del Gantt por link con token"
```

---

## Spec Coverage Check

- Link público sin expiración, revocable (spec §5) → Task 2, 4, 7, 8.
- Cliente ve Gantt de solo lectura (spec §5) → Task 8 (`canManage={false}`).
- Visibilidad de comentarios/adjuntos, toggle "compartir con cliente" (spec §6) → Task 4, 5, 6.
- `work_item_comments.visibility` reusado (no se crea), `work_item_attachments.visibility` agregado (spec §6) → Task 1, 4.
- Signed URLs server-side para adjuntos públicos, nunca bucket expuesto directo (spec §6) → Task 8.
- Sin acciones de mutación en la ruta pública (spec, Reglas) → Task 8 (página 100% de solo lectura, sin ningún form/action).
- Ninguna pieza de Portal Cliente más allá de esto (spec, Fuera de alcance) → no se toca `PortalCliente.md` ni se agrega login de cliente en ningún task.
