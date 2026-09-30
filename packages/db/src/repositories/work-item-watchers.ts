import type { Db } from "./shared";

export interface WatcherRow {
  user_id: string;
}

/** Seguidores de una tarea/subtarea (solo user_id — el nombre se resuelve en
 * la capa de acción contra `listOrgUsers`, igual que `work_item_assignees`). */
export async function listWatchers(db: Db, workItemId: string): Promise<WatcherRow[]> {
  const { data, error } = await db
    .from("work_item_watchers")
    .select("user_id")
    .eq("work_item_id", workItemId);
  if (error) throw error;
  return data ?? [];
}

/** Reemplaza el set completo de seguidores (borra e inserta), mismo patrón
 * borrar+insertar que `setAssignees`. */
export async function setWatchers(
  db: Db,
  workItemId: string,
  orgId: string,
  userIds: string[],
): Promise<void> {
  const { error: deleteError } = await db
    .from("work_item_watchers")
    .delete()
    .eq("work_item_id", workItemId);
  if (deleteError) throw deleteError;

  if (userIds.length === 0) return;

  const { error: insertError } = await db.from("work_item_watchers").insert(
    userIds.map((userId) => ({
      work_item_id: workItemId,
      user_id: userId,
      organization_id: orgId,
    })),
  );
  if (insertError) throw insertError;
}

/** Agrega un seguidor si todavía no lo es (auto-seguir al comentar). Ignora el
 * conflicto de PK en vez de chequear existencia primero (menos round-trips). */
export async function addWatcherIfAbsent(
  db: Db,
  workItemId: string,
  orgId: string,
  userId: string,
): Promise<void> {
  const { error } = await db
    .from("work_item_watchers")
    .upsert(
      { work_item_id: workItemId, user_id: userId, organization_id: orgId },
      { onConflict: "work_item_id,user_id", ignoreDuplicates: true },
    );
  if (error) throw error;
}
