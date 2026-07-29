"use server";

import { revalidatePath } from "next/cache";
import {
  createProject,
  createStatus,
  createWorkItem,
  deleteStatus,
  reorderStatuses,
  setAssignees,
  softDeleteWorkItem,
  updateStatus,
  updateWorkItem,
  type Db,
  type Enums,
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

      await updateWorkItem(db, id, {
        title,
        description: input.description?.trim() || null,
        priority: input.priority,
        status_id: input.statusId ?? null,
        start_date: input.startDate || null,
        due_date: input.dueDate || null,
      });
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
      // `createWorkItem` no admite description/start_date; se completan con un
      // segundo update solo si vinieron en el input (evita una escritura extra).
      if (input.description?.trim() || input.startDate) {
        await updateWorkItem(db, id, {
          description: input.description?.trim() || null,
          start_date: input.startDate || null,
        });
      }
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

    await updateWorkItem(db, id, { status_id: statusId });

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

    await setAssignees(db, id, auth.organizationId, userIds);

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
