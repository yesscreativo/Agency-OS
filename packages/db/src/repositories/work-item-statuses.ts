import type { Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type StatusRow = Tables<"work_item_statuses">;

/** Catálogo de columnas del tablero de UN proyecto (work_item_statuses.project_id
 * apunta al work_item raíz del proyecto), ordenado por sort_order. RLS limita a la
 * organización del usuario. */
export async function listStatuses(db: Db, projectId: string): Promise<StatusRow[]> {
  const { data, error } = await db
    .from("work_item_statuses")
    .select("*")
    .eq("project_id", projectId)
    .order("sort_order");
  if (error) throw error;
  return data ?? [];
}

export async function createStatus(
  db: Db,
  values: TablesInsert<"work_item_statuses">,
): Promise<StatusRow> {
  const { data, error } = await db.from("work_item_statuses").insert(values).select().single();
  if (error) throw error;
  return data;
}

export async function updateStatus(
  db: Db,
  id: string,
  values: Partial<Pick<StatusRow, "label" | "color" | "is_done" | "sort_order">>,
): Promise<StatusRow> {
  const { data, error } = await db
    .from("work_item_statuses")
    .update(values)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** `work_items_status_fk` es `on delete set null`, así que borrar una columna en
 * uso no falla: los work items que la referenciaban quedan sin status_id. */
export async function deleteStatus(db: Db, id: string): Promise<void> {
  const { error } = await db.from("work_item_statuses").delete().eq("id", id);
  if (error) throw error;
}

/** Reasigna sort_order = índice en el orden recibido. A diferencia de
 * `reorderQuoteStatuses` (RPC transaccional en una sola llamada), acá no existe
 * RPC para work_item_statuses: se actualiza fila a fila, mismo patrón que
 * `setQuoteItemResponses` en quotes.ts. `orderedIds` es la lista completa en el
 * nuevo orden. */
export async function reorderStatuses(db: Db, orderedIds: string[]): Promise<void> {
  for (const [index, id] of orderedIds.entries()) {
    const { error } = await db
      .from("work_item_statuses")
      .update({ sort_order: index })
      .eq("id", id);
    if (error) throw error;
  }
}
