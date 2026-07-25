import type { Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type KamRow = Tables<"kams">;

export interface KamListFilters {
  /** true → solo activas (para selects de formulario/filtro). */
  onlyActive?: boolean;
}

export async function listKams(db: Db, filters: KamListFilters = {}): Promise<KamRow[]> {
  let query = db.from("kams").select("*").is("deleted_at", null).order("name");
  if (filters.onlyActive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createKam(db: Db, values: TablesInsert<"kams">): Promise<KamRow> {
  const { data, error } = await db.from("kams").insert(values).select().single();
  if (error) throw error;
  return data;
}

export async function updateKam(
  db: Db,
  id: string,
  values: Partial<Pick<KamRow, "name" | "is_active" | "user_id">>,
): Promise<KamRow> {
  const { data, error } = await db.from("kams").update(values).eq("id", id).select().single();
  if (error) throw error;
  return data;
}
