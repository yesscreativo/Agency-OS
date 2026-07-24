import type { Tables } from "../types/database";
import type { Db } from "./shared";

export type ModuleRow = Tables<"modules">;

/** Catálogo de módulos del sistema, ordenado para la landing. */
export async function listModules(db: Db): Promise<ModuleRow[]> {
  const { data, error } = await db.from("modules").select("*").order("sort_order");
  if (error) throw error;
  return data ?? [];
}
