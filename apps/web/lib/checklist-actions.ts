"use server";

import {
  deleteChecklistItem,
  getChecklistItem,
  insertChecklistItem,
  isWorkItemAssignee,
  listChecklistItems,
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

    const existing = await listChecklistItems(db, workItemId);
    const existingIds = new Set(existing.map((i) => i.id));
    if (orderedIds.some((id) => !existingIds.has(id))) {
      return { error: "La lista de ítems no coincide con la checklist de esta tarea." };
    }

    await reorderChecklistItems(db, orderedIds);
    return { ok: true };
  } catch (error) {
    console.error("reorderChecklistItemsAction", error);
    return { error: "No se pudo reordenar la checklist. Intenta de nuevo." };
  }
}
