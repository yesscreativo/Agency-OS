"use server";

import { revalidatePath } from "next/cache";
import {
  createProject,
  createStatus,
  createWorkItem,
  deleteAttachmentRow,
  deleteStatus,
  getAttachment,
  getComment,
  insertAttachment,
  listAttachments,
  listCommentAttachments,
  recordActivity,
  reorderStatuses,
  setAssignees,
  softDeleteWorkItem,
  updateStatus,
  updateWorkItem,
  type AttachmentRow,
  type Db,
  type Enums,
  type Json,
} from "@agency-os/db";
import { validateWorkItemTitle } from "@agency-os/domain";
import { getCurrentUser, hasPermission } from "@/lib/auth";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export type IdResult = { id: string; error?: never } | { id?: never; error: string };
export type ActionResult = { ok: true; error?: never } | { ok?: never; error: string };

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

async function requireProjectAssigner(): Promise<ManagerAuth> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "project.assign")) {
    return { error: "No tienes permiso para asignar responsables." };
  }
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };
  return { organizationId, userId: user.id };
}

/** Defensa en profundidad: `updateWorkItem`/`softDeleteWorkItem`/`setAssignees`
 * (Task 3, `@agency-os/db`) no filtran por `organization_id` a nivel de repo —a
 * diferencia de `updateClient`/`softDeleteClient`—, así que se confirma acá que
 * el work item pertenece a la organización del usuario antes de mutarlo.
 * Devuelve su `project_id` (para `revalidatePath`) o `null` si no existe / es de
 * otra organización. */
async function assertWorkItemInOrg(
  db: Db,
  id: string,
  organizationId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("work_items")
    .select("organization_id, project_id")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.organization_id !== organizationId) return null;
  return data.project_id;
}

/** Igual que `assertWorkItemInOrg` pero para columnas del tablero
 * (`work_item_statuses`): `updateStatus`/`deleteStatus` tampoco filtran por
 * organización a nivel de repo. */
async function assertStatusInOrg(
  db: Db,
  id: string,
  organizationId: string,
): Promise<string | null> {
  const { data, error } = await db
    .from("work_item_statuses")
    .select("organization_id, project_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data || data.organization_id !== organizationId) return null;
  return data.project_id;
}

/** Confirma que el cliente pertenece a la organización del usuario antes de
 * usarlo (misma defensa en profundidad que `assertWorkItemInOrg`). */
async function assertClientInOrg(db: Db, id: string, organizationId: string): Promise<boolean> {
  const { data, error } = await db
    .from("clients")
    .select("organization_id")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return !!data && data.organization_id === organizationId;
}

/** Registra un evento en el activity timeline del work item. La actividad es
 * secundaria: nunca debe tumbar la mutación principal, por eso va en try/catch. */
async function safeActivity(
  db: Db,
  input: {
    orgId: string;
    workItemId: string;
    actorUserId: string;
    eventType: string;
    payload?: Json;
  },
): Promise<void> {
  try {
    await recordActivity(db, {
      orgId: input.orgId,
      workItemId: input.workItemId,
      actorUserId: input.actorUserId,
      eventType: input.eventType,
      payload: input.payload,
    });
  } catch (error) {
    console.error("recordActivity", error);
  }
}

/** Etiqueta de una columna del tablero (para el payload de status_changed). */
async function statusLabel(db: Db, id: string | null): Promise<string | null> {
  if (!id) return null;
  const { data } = await db.from("work_item_statuses").select("label").eq("id", id).maybeSingle();
  return data?.label ?? null;
}

// ---------- Proyecto ----------

export interface CreateProjectInput {
  clientId: string;
  quoteId?: string;
  title: string;
}

/** Crea el work_item raíz de un proyecto (siembra el tablero con las 4 columnas
 * por defecto vía RPC, ver `createProject` en `@agency-os/db`). */
export async function createProjectAction(input: CreateProjectInput): Promise<IdResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  const title = input.title.trim();
  const validation = validateWorkItemTitle(title);
  if (!validation.valid) return { error: validation.error ?? "Título inválido." };
  if (!input.clientId) return { error: "Selecciona un cliente." };

  try {
    const db = await getSupabaseServerClient();

    if (!(await assertClientInOrg(db, input.clientId, auth.organizationId))) {
      return { error: "El cliente no existe o no pertenece a tu organización." };
    }

    const id = await createProject(db, {
      orgId: auth.organizationId,
      clientId: input.clientId,
      quoteId: input.quoteId || undefined,
      title,
      createdBy: auth.userId,
    });
    revalidatePath("/proyectos");
    return { id };
  } catch (error) {
    console.error("createProjectAction", error);
    return { error: "No se pudo crear el proyecto. Intenta de nuevo." };
  }
}

// ---------- Tareas / subtareas ----------

export interface WorkItemInput {
  /** id de la tarea existente; sin él, se crea una nueva. */
  id?: string;
  projectId: string;
  /** null/omitido en una tarea top-level; el id de la tarea padre en una subtarea. */
  parentId?: string | null;
  /** Solo aplica al crear (una tarea existente no cambia de tipo). Por defecto "task". */
  type?: Extract<Enums<"work_item_type">, "task" | "subtask">;
  title: string;
  description?: string | null;
  statusId?: string | null;
  priority?: Enums<"work_item_priority">;
  startDate?: string | null;
  dueDate?: string | null;
  /** Duración estimada en minutos (null limpia la estimación). */
  estimatedMinutes?: number | null;
}

/** Crea o actualiza una tarea/subtarea. */
export async function saveWorkItem(input: WorkItemInput): Promise<IdResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  const title = input.title.trim();
  const validation = validateWorkItemTitle(title);
  if (!validation.valid) return { error: validation.error ?? "Título inválido." };
  if (!input.projectId) return { error: "Falta el proyecto." };

  try {
    const db = await getSupabaseServerClient();
    let id = input.id;

    let revalidateProjectId: string;

    if (id) {
      const projectId = await assertWorkItemInOrg(db, id, auth.organizationId);
      if (!projectId) return { error: "La tarea no existe o no pertenece a tu organización." };

      if (input.statusId) {
        const statusProjectId = await assertStatusInOrg(db, input.statusId, auth.organizationId);
        if (!statusProjectId || statusProjectId !== projectId) {
          return { error: "El estado no pertenece a este proyecto." };
        }
      }

      // Estado previo para diffear el activity timeline.
      const { data: prev } = await db
        .from("work_items")
        .select("title, description, status_id, priority")
        .eq("id", id)
        .maybeSingle();

      const newDescription = input.description?.trim() || null;
      const newStatusId = input.statusId ?? null;

      await updateWorkItem(db, id, {
        title,
        description: newDescription,
        priority: input.priority,
        status_id: newStatusId,
        start_date: input.startDate || null,
        due_date: input.dueDate || null,
        estimated_minutes: input.estimatedMinutes ?? null,
      });

      if (prev) {
        if (prev.title !== title) {
          await safeActivity(db, {
            orgId: auth.organizationId,
            workItemId: id,
            actorUserId: auth.userId,
            eventType: "title_edited",
            payload: { from: prev.title, to: title },
          });
        }
        if ((prev.description ?? null) !== newDescription) {
          await safeActivity(db, {
            orgId: auth.organizationId,
            workItemId: id,
            actorUserId: auth.userId,
            eventType: "description_edited",
            payload: {},
          });
        }
        if (input.priority && prev.priority !== input.priority) {
          await safeActivity(db, {
            orgId: auth.organizationId,
            workItemId: id,
            actorUserId: auth.userId,
            eventType: "priority_changed",
            payload: { from: prev.priority, to: input.priority },
          });
        }
        if ((prev.status_id ?? null) !== newStatusId) {
          await safeActivity(db, {
            orgId: auth.organizationId,
            workItemId: id,
            actorUserId: auth.userId,
            eventType: "status_changed",
            payload: { from: prev.status_id ?? null, to: newStatusId, label: await statusLabel(db, newStatusId) },
          });
        }
      }
      revalidateProjectId = projectId;
    } else {
      if (input.parentId) {
        const parentProjectId = await assertWorkItemInOrg(db, input.parentId, auth.organizationId);
        if (!parentProjectId) {
          return { error: "La tarea padre no existe o no pertenece a tu organización." };
        }
      }
      const projectId = await assertWorkItemInOrg(db, input.projectId, auth.organizationId);
      if (!projectId) return { error: "El proyecto no existe o no pertenece a tu organización." };

      id = await createWorkItem(db, {
        orgId: auth.organizationId,
        projectId: input.projectId,
        parentId: input.parentId ?? null,
        type: input.type ?? "task",
        title,
        statusId: input.statusId,
        priority: input.priority,
        dueDate: input.dueDate,
      });
      // `createWorkItem` no admite description/start_date/estimated_minutes; se
      // completan con un segundo update solo si vinieron en el input (evita una
      // escritura extra).
      if (input.description?.trim() || input.startDate || input.estimatedMinutes != null) {
        await updateWorkItem(db, id, {
          description: input.description?.trim() || null,
          start_date: input.startDate || null,
          estimated_minutes: input.estimatedMinutes ?? null,
        });
      }
      await safeActivity(db, {
        orgId: auth.organizationId,
        workItemId: id,
        actorUserId: auth.userId,
        eventType: "created",
        payload: { title, type: input.type ?? "task" },
      });
      revalidateProjectId = projectId;
    }

    revalidatePath("/proyectos");
    revalidatePath(`/proyectos/${revalidateProjectId}`);
    return { id };
  } catch (error) {
    console.error("saveWorkItem", error);
    return { error: "No se pudo guardar la tarea. Intenta de nuevo." };
  }
}

/** Baja lógica de una tarea/subtarea (soft-delete). */
export async function deleteWorkItem(id: string): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    const projectId = await assertWorkItemInOrg(db, id, auth.organizationId);
    if (!projectId) return { error: "La tarea no existe o no pertenece a tu organización." };

    await softDeleteWorkItem(db, id);

    revalidatePath("/proyectos");
    revalidatePath(`/proyectos/${projectId}`);
    return { ok: true };
  } catch (error) {
    console.error("deleteWorkItem", error);
    return { error: "No se pudo eliminar la tarea. Intenta de nuevo." };
  }
}

/** Mueve una tarea a otra columna del tablero (drag&drop). Verifica que la
 * columna destino sea del mismo proyecto (y organización) que la tarea. */
export async function moveWorkItem(id: string, statusId: string): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (!statusId) return { error: "Estado inválido." };

  try {
    const db = await getSupabaseServerClient();
    const projectId = await assertWorkItemInOrg(db, id, auth.organizationId);
    if (!projectId) return { error: "La tarea no existe o no pertenece a tu organización." };

    const statusProjectId = await assertStatusInOrg(db, statusId, auth.organizationId);
    if (!statusProjectId || statusProjectId !== projectId) {
      return { error: "El estado no pertenece a este proyecto." };
    }

    const { data: prev } = await db
      .from("work_items")
      .select("status_id")
      .eq("id", id)
      .maybeSingle();

    await updateWorkItem(db, id, { status_id: statusId });

    if (!prev || prev.status_id !== statusId) {
      await safeActivity(db, {
        orgId: auth.organizationId,
        workItemId: id,
        actorUserId: auth.userId,
        eventType: "status_changed",
        payload: { from: prev?.status_id ?? null, to: statusId, label: await statusLabel(db, statusId) },
      });
    }

    revalidatePath("/proyectos");
    revalidatePath(`/proyectos/${projectId}`);
    return { ok: true };
  } catch (error) {
    console.error("moveWorkItem", error);
    return { error: "No se pudo mover la tarea. Intenta de nuevo." };
  }
}

/** Reemplaza el set completo de asignados de una tarea. */
export async function setWorkItemAssignees(id: string, userIds: string[]): Promise<ActionResult> {
  const auth = await requireProjectAssigner();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    const projectId = await assertWorkItemInOrg(db, id, auth.organizationId);
    if (!projectId) return { error: "La tarea no existe o no pertenece a tu organización." };

    // Set previo para diffear altas/bajas en el activity timeline.
    const { data: prevRows } = await db
      .from("work_item_assignees")
      .select("user_id")
      .eq("work_item_id", id);
    const prevIds = new Set((prevRows ?? []).map((r) => r.user_id));
    const nextIds = new Set(userIds);

    await setAssignees(db, id, auth.organizationId, userIds);

    for (const uid of nextIds) {
      if (!prevIds.has(uid)) {
        await safeActivity(db, {
          orgId: auth.organizationId,
          workItemId: id,
          actorUserId: auth.userId,
          eventType: "assignee_added",
          payload: { userId: uid },
        });
      }
    }
    for (const uid of prevIds) {
      if (!nextIds.has(uid)) {
        await safeActivity(db, {
          orgId: auth.organizationId,
          workItemId: id,
          actorUserId: auth.userId,
          eventType: "assignee_removed",
          payload: { userId: uid },
        });
      }
    }

    revalidatePath(`/proyectos/${projectId}`);
    return { ok: true };
  } catch (error) {
    console.error("setWorkItemAssignees", error);
    return { error: "No se pudieron actualizar los asignados. Intenta de nuevo." };
  }
}

// ---------- Estados del tablero ----------

export interface ProjectStatusInput {
  /** id del estado existente; sin él, se crea uno nuevo. */
  id?: string;
  projectId: string;
  label: string;
  color?: string;
  isDone?: boolean;
  sortOrder?: number;
}

/** Crea o actualiza una columna del tablero (`work_item_statuses`). */
export async function saveProjectStatus(input: ProjectStatusInput): Promise<IdResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  const label = input.label.trim();
  if (!label) return { error: "El nombre del estado es obligatorio." };
  if (!input.projectId) return { error: "Falta el proyecto." };

  try {
    const db = await getSupabaseServerClient();
    let id: string;

    if (input.id) {
      const projectId = await assertStatusInOrg(db, input.id, auth.organizationId);
      if (!projectId) return { error: "El estado no existe o no pertenece a tu organización." };
      const row = await updateStatus(db, input.id, {
        label,
        color: input.color,
        is_done: input.isDone,
        sort_order: input.sortOrder,
      });
      id = row.id;
    } else {
      const row = await createStatus(db, {
        organization_id: auth.organizationId,
        project_id: input.projectId,
        label,
        color: input.color,
        is_done: input.isDone,
        sort_order: input.sortOrder,
      });
      id = row.id;
    }

    revalidatePath(`/proyectos/${input.projectId}`);
    return { id };
  } catch (error) {
    console.error("saveProjectStatus", error);
    return { error: "No se pudo guardar el estado. Intenta de nuevo." };
  }
}

/** Elimina una columna del tablero. Las tareas que la usaban quedan sin estado
 * (`work_items_status_fk` es `on delete set null`, ver `deleteStatus`). */
export async function deleteProjectStatus(id: string): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    const projectId = await assertStatusInOrg(db, id, auth.organizationId);
    if (!projectId) return { error: "El estado no existe o no pertenece a tu organización." };

    await deleteStatus(db, id);

    revalidatePath(`/proyectos/${projectId}`);
    return { ok: true };
  } catch (error) {
    console.error("deleteProjectStatus", error);
    return { error: "No se pudo eliminar el estado. Intenta de nuevo." };
  }
}

/** Reordena las columnas del tablero según el orden recibido. `orderedIds` debe
 * ser la lista completa de estados del proyecto, en el nuevo orden. */
export async function reorderProjectStatuses(
  projectId: string,
  orderedIds: string[],
): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };
  if (!projectId) return { error: "Falta el proyecto." };
  if (orderedIds.length === 0) return { ok: true };

  try {
    const db = await getSupabaseServerClient();

    // Defensa en profundidad: todos los ids deben ser columnas de este proyecto/organización.
    const { data, error } = await db
      .from("work_item_statuses")
      .select("id, organization_id, project_id")
      .in("id", orderedIds);
    if (error) throw error;
    const rows = data ?? [];
    if (
      rows.length !== orderedIds.length ||
      rows.some((r) => r.organization_id !== auth.organizationId || r.project_id !== projectId)
    ) {
      return { error: "Los estados no pertenecen a este proyecto." };
    }

    await reorderStatuses(db, orderedIds);

    revalidatePath(`/proyectos/${projectId}`);
    return { ok: true };
  } catch (error) {
    console.error("reorderProjectStatuses", error);
    return { error: "No se pudo reordenar los estados. Intenta de nuevo." };
  }
}

// ---------- Adjuntos ----------

const ATTACHMENT_BUCKET = "work-item-files";
const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024; // 10 MB (paridad con el bucket, ver 019)

/** Neutraliza tipos "activos" que el navegador ejecutaría inline (XSS almacenado):
 * un `.html` o `.svg` servido con su MIME real correría scripts al abrir la URL
 * firmada. Se fuerzan a `application/octet-stream` (el navegador los descarga en
 * vez de renderizarlos). El resto (imágenes raster, PDF, etc.) conserva su MIME. */
function safeStorageContentType(mime: string): string {
  const m = mime.toLowerCase();
  if (m === "text/html" || m === "application/xhtml+xml" || m.startsWith("image/svg")) {
    return "application/octet-stream";
  }
  return mime;
}

export interface WorkItemAttachment {
  id: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  /** URL firmada temporal (1 h) para descargar/previsualizar. */
  url: string | null;
}

export type AttachmentResult =
  | { attachment: WorkItemAttachment; error?: never }
  | { attachment?: never; error: string };
export type AttachmentListResult =
  | { attachments: WorkItemAttachment[]; error?: never }
  | { attachments?: never; error: string };

async function signedAttachmentUrl(db: Db, path: string): Promise<string | null> {
  const { data } = await db.storage.from(ATTACHMENT_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

function toAttachment(row: AttachmentRow, url: string | null): WorkItemAttachment {
  return {
    id: row.id,
    filename: row.filename,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    url,
  };
}

/** Sube un archivo al bucket privado y registra la fila. La tarea ya debe existir
 * (al crear, la UI guarda primero y sube después con el id devuelto). */
export async function uploadWorkItemAttachment(
  workItemId: string,
  formData: FormData,
): Promise<AttachmentResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo." };
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: "El archivo supera el límite de 10 MB." };

  try {
    const db = await getSupabaseServerClient();
    const projectId = await assertWorkItemInOrg(db, workItemId, auth.organizationId);
    if (!projectId) return { error: "La tarea no existe o no pertenece a tu organización." };

    // Ruta prefijada por organización: <org_id>/<work_item_id>/<uuid>-<archivo>.
    // El primer segmento es lo que las políticas RLS del bucket (020) cotejan
    // contra current_user_organization_ids() para aislar por tenant.
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${auth.organizationId}/${workItemId}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await db.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
      contentType: file.type ? safeStorageContentType(file.type) : "application/octet-stream",
      upsert: false,
    });
    if (uploadError) {
      console.error("uploadWorkItemAttachment:storage", uploadError);
      return { error: "No se pudo subir el archivo." };
    }

    const row = await insertAttachment(db, {
      work_item_id: workItemId,
      organization_id: auth.organizationId,
      path,
      filename: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      created_by: auth.userId,
    });

    revalidatePath(`/proyectos/${projectId}`);
    return { attachment: toAttachment(row, await signedAttachmentUrl(db, path)) };
  } catch (error) {
    console.error("uploadWorkItemAttachment", error);
    return { error: "No se pudo subir el archivo. Intenta de nuevo." };
  }
}

/** Lista los adjuntos de una tarea con URLs firmadas. Gate `project.view`. */
export async function listWorkItemAttachments(workItemId: string): Promise<AttachmentListResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "project.view")) return { error: "No tienes permiso." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };

  try {
    const db = await getSupabaseServerClient();
    const projectId = await assertWorkItemInOrg(db, workItemId, organizationId);
    if (!projectId) return { error: "La tarea no existe o no pertenece a tu organización." };

    const rows = await listAttachments(db, workItemId);
    const attachments = await Promise.all(
      rows.map(async (r) => toAttachment(r, await signedAttachmentUrl(db, r.path))),
    );
    return { attachments };
  } catch (error) {
    console.error("listWorkItemAttachments", error);
    return { error: "No se pudieron cargar los adjuntos." };
  }
}

/** Borra el binario del bucket y la fila. Gate `project.manage`. */
export async function deleteWorkItemAttachment(id: string): Promise<ActionResult> {
  const auth = await requireProjectManager();
  if (auth.error !== undefined) return { error: auth.error };

  try {
    const db = await getSupabaseServerClient();
    const attachment = await getAttachment(db, id);
    if (!attachment || attachment.organization_id !== auth.organizationId) {
      return { error: "El adjunto no existe o no pertenece a tu organización." };
    }

    const { error: rmError } = await db.storage.from(ATTACHMENT_BUCKET).remove([attachment.path]);
    // Si el objeto ya no está en el bucket igual limpiamos la fila (no bloqueamos).
    if (rmError) console.error("deleteWorkItemAttachment:storage", rmError);

    await deleteAttachmentRow(db, id);

    const projectId = await assertWorkItemInOrg(db, attachment.work_item_id, auth.organizationId);
    if (projectId) revalidatePath(`/proyectos/${projectId}`);
    return { ok: true };
  } catch (error) {
    console.error("deleteWorkItemAttachment", error);
    return { error: "No se pudo eliminar el adjunto. Intenta de nuevo." };
  }
}

// ---------- Adjuntos de comentarios ----------

/** Sube un archivo asociado a un COMENTARIO. Gate `project.view` + ser autor del
 * comentario (comentar no exige `project.manage`; la policy de INSERT del bucket
 * se relajó a miembro de la org en 025). */
export async function uploadCommentAttachment(
  commentId: string,
  formData: FormData,
): Promise<AttachmentResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "project.view")) return { error: "No tienes permiso." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Selecciona un archivo." };
  if (file.size > MAX_ATTACHMENT_BYTES) return { error: "El archivo supera el límite de 10 MB." };

  try {
    const db = await getSupabaseServerClient();
    const comment = await getComment(db, commentId);
    if (!comment || comment.organization_id !== organizationId) {
      return { error: "El comentario no existe o no pertenece a tu organización." };
    }
    if (comment.author_user_id !== user.id) {
      return { error: "Solo puedes adjuntar archivos a tus propios comentarios." };
    }

    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const path = `${organizationId}/${comment.work_item_id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await db.storage.from(ATTACHMENT_BUCKET).upload(path, file, {
      contentType: file.type ? safeStorageContentType(file.type) : "application/octet-stream",
      upsert: false,
    });
    if (uploadError) {
      console.error("uploadCommentAttachment:storage", uploadError);
      return { error: "No se pudo subir el archivo." };
    }

    const row = await insertAttachment(db, {
      work_item_id: comment.work_item_id,
      comment_id: commentId,
      organization_id: organizationId,
      path,
      filename: file.name,
      mime_type: file.type || null,
      size_bytes: file.size,
      created_by: user.id,
    });

    revalidatePath("/proyectos");
    return { attachment: toAttachment(row, await signedAttachmentUrl(db, path)) };
  } catch (error) {
    console.error("uploadCommentAttachment", error);
    return { error: "No se pudo subir el archivo. Intenta de nuevo." };
  }
}

export interface CommentAttachment extends WorkItemAttachment {
  commentId: string;
}
export type CommentAttachmentsResult =
  | { attachments: CommentAttachment[]; error?: never }
  | { attachments?: never; error: string };

/** Adjuntos de los comentarios de una tarea (URLs firmadas), para agruparlos por
 * comentario en el hilo. Gate `project.view`. */
export async function listCommentAttachmentsForWorkItem(
  workItemId: string,
): Promise<CommentAttachmentsResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  if (!hasPermission(user, "project.view")) return { error: "No tienes permiso." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };

  try {
    const db = await getSupabaseServerClient();
    const projectId = await assertWorkItemInOrg(db, workItemId, organizationId);
    if (!projectId) return { error: "La tarea no existe o no pertenece a tu organización." };

    const rows = await listCommentAttachments(db, workItemId);
    const attachments = await Promise.all(
      rows.map(async (r) => ({
        ...toAttachment(r, await signedAttachmentUrl(db, r.path)),
        commentId: r.comment_id as string,
      })),
    );
    return { attachments };
  } catch (error) {
    console.error("listCommentAttachmentsForWorkItem", error);
    return { error: "No se pudieron cargar los adjuntos." };
  }
}

/** Borra un adjunto de comentario: autor del comentario o `project.manage`. */
export async function deleteCommentAttachment(id: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sesión expirada. Vuelve a iniciar sesión." };
  const organizationId = user.organizationIds[0];
  if (!organizationId) return { error: "Tu usuario no pertenece a ninguna organización." };

  try {
    const db = await getSupabaseServerClient();
    const attachment = await getAttachment(db, id);
    if (!attachment || attachment.organization_id !== organizationId || !attachment.comment_id) {
      return { error: "El adjunto no existe o no pertenece a tu organización." };
    }
    const comment = await getComment(db, attachment.comment_id);
    const isAuthor = comment?.author_user_id === user.id;
    if (!isAuthor && !hasPermission(user, "project.manage")) {
      return { error: "No puedes eliminar este adjunto." };
    }

    const { error: rmError } = await db.storage.from(ATTACHMENT_BUCKET).remove([attachment.path]);
    if (rmError) console.error("deleteCommentAttachment:storage", rmError);
    await deleteAttachmentRow(db, id);

    revalidatePath("/proyectos");
    return { ok: true };
  } catch (error) {
    console.error("deleteCommentAttachment", error);
    return { error: "No se pudo eliminar el adjunto. Intenta de nuevo." };
  }
}
