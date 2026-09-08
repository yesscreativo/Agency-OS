import type { Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type ChecklistItemRow = Tables<"checklist_items">;

/** Ítems no borrados de un work item, en orden. */
export async function listChecklistItems(db: Db, workItemId: string): Promise<ChecklistItemRow[]> {
  const { data, error } = await db
    .from("checklist_items")
    .select("*")
    .eq("work_item_id", workItemId)
    .is("deleted_at", null)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function getChecklistItem(db: Db, id: string): Promise<ChecklistItemRow | null> {
  const { data, error } = await db
    .from("checklist_items")
    .select("*")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export interface InsertChecklistItemInput {
  organizationId: string;
  workItemId: string;
  label: string;
  createdBy: string;
}

/** Agrega un ítem al final de la lista (sort_order = máximo actual + 1). */
export async function insertChecklistItem(
  db: Db,
  values: InsertChecklistItemInput,
): Promise<ChecklistItemRow> {
  const existing = await listChecklistItems(db, values.workItemId);
  const sortOrder =
    existing.length > 0 ? Math.max(...existing.map((i) => i.sort_order)) + 1 : 0;
  const insertValues: TablesInsert<"checklist_items"> = {
    organization_id: values.organizationId,
    work_item_id: values.workItemId,
    label: values.label,
    sort_order: sortOrder,
    created_by: values.createdBy,
  };
  const { data, error } = await db
    .from("checklist_items")
    .insert(insertValues)
    .select("*")
    .single();
  if (error) throw error;
  return data;
}

/** Tilda/destilda un ítem. Al destildar, limpia completed_by/completed_at. */
export async function toggleChecklistItem(
  db: Db,
  id: string,
  completed: boolean,
  userId: string,
): Promise<void> {
  const { error } = await db
    .from("checklist_items")
    .update({
      is_completed: completed,
      completed_by: completed ? userId : null,
      completed_at: completed ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) throw error;
}

export async function updateChecklistItemLabel(db: Db, id: string, label: string): Promise<void> {
  const { error } = await db
    .from("checklist_items")
    .update({ label, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Soft delete (deleted_at), consistente con comentarios/adjuntos. */
export async function deleteChecklistItem(db: Db, id: string): Promise<void> {
  const { error } = await db
    .from("checklist_items")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Batch update de sort_order según el nuevo orden (mismo patrón que
 * reorderStatuses en work-item-statuses.ts). */
export async function reorderChecklistItems(db: Db, orderedIds: string[]): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await db
      .from("checklist_items")
      .update({ sort_order: index })
      .eq("id", id);
    if (error) throw error;
  }
}

/** ¿El usuario está asignado a este work item? Permite que el ejecutor (no
 * solo project.manage) escriba su propia checklist. */
export async function isWorkItemAssignee(
  db: Db,
  workItemId: string,
  userId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("work_item_assignees")
    .select("user_id")
    .eq("work_item_id", workItemId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}
