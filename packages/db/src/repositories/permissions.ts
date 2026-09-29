import type { Tables } from "../types/database";
import type { Db } from "./shared";

export type PermissionRow = Tables<"permissions">;

/** Catálogo completo de permisos (fijo, se mantiene por migración) — el
 * editor de roles solo lee de aquí para armar los checkboxes por rol. */
export async function listPermissions(db: Db): Promise<PermissionRow[]> {
  const { data, error } = await db.from("permissions").select("*").order("code");
  if (error) throw error;
  return data ?? [];
}
