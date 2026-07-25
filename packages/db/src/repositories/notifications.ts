import type { Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type NotificationRow = Tables<"notifications">;
export type NotificationInsert = TablesInsert<"notifications">;

/** Inserta una o varias notificaciones. Se llama con el cliente service_role
 * (flujo público) o service_role puntual (acciones server-side), porque la RLS
 * no permite insertar filas de otros usuarios. */
export async function createNotifications(
  db: Db,
  rows: NotificationInsert[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await db.from("notifications").insert(rows);
  if (error) throw error;
}

export async function listNotifications(
  db: Db,
  userId: string,
  { limit = 30 }: { limit?: number } = {},
): Promise<NotificationRow[]> {
  const { data, error } = await db
    .from("notifications")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function countUnread(db: Db, userId: string): Promise<number> {
  const { count, error } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export async function markRead(db: Db, ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const { error } = await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids)
    .is("read_at", null);
  if (error) throw error;
}

export async function markAllRead(db: Db, userId: string): Promise<void> {
  const { error } = await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", userId)
    .is("read_at", null);
  if (error) throw error;
}

/** Resuelve a quién notificar por una cotización: quien la envió (sent_by, o
 * created_by como respaldo) y el usuario vinculado al KAM/PM asignado. Devuelve
 * los user_id únicos. `exclude` (p. ej. el actor de un cambio manual) se omite. */
export async function resolveQuoteNotifyUserIds(
  db: Db,
  quote: { sent_by: string | null; created_by: string | null; kam_id: string | null },
  exclude?: string | null,
): Promise<string[]> {
  const ids = new Set<string>();
  if (quote.sent_by) ids.add(quote.sent_by);
  else if (quote.created_by) ids.add(quote.created_by);

  if (quote.kam_id) {
    const { data } = await db.from("kams").select("user_id").eq("id", quote.kam_id).maybeSingle();
    if (data?.user_id) ids.add(data.user_id);
  }

  if (exclude) ids.delete(exclude);
  return [...ids];
}
