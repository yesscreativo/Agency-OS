import type { Tables, TablesInsert } from "../types/database";
import type { Db } from "./shared";

export type QuoteStatusRow = Tables<"quote_statuses">;

export interface QuoteStatusListFilters {
  /** true → solo activos (para selects de formulario/filtro). */
  onlyActive?: boolean;
}

/** Catálogo de estados del pipeline de la organización, ordenado por sort_order.
 * RLS limita a la organización del usuario. */
export async function listQuoteStatuses(
  db: Db,
  filters: QuoteStatusListFilters = {},
): Promise<QuoteStatusRow[]> {
  let query = db.from("quote_statuses").select("*").order("sort_order");
  if (filters.onlyActive) query = query.eq("is_active", true);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function createQuoteStatus(
  db: Db,
  values: TablesInsert<"quote_statuses">,
): Promise<QuoteStatusRow> {
  const { data, error } = await db.from("quote_statuses").insert(values).select().single();
  if (error) throw error;
  return data;
}

export async function updateQuoteStatus(
  db: Db,
  id: string,
  values: Partial<
    Pick<QuoteStatusRow, "label" | "color" | "is_solid" | "on_color" | "is_active" | "sort_order">
  >,
): Promise<QuoteStatusRow> {
  const { data, error } = await db
    .from("quote_statuses")
    .update(values)
    .eq("id", id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/** El guard trigger rechaza el borrado de estados de sistema; y la FK de quotes
 * lo rechaza si hay cotizaciones usando el código. */
export async function deleteQuoteStatus(db: Db, id: string): Promise<void> {
  const { error } = await db.from("quote_statuses").delete().eq("id", id);
  if (error) throw error;
}

/** Reasigna sort_order = índice*10 en una sola transacción (RPC SECURITY INVOKER,
 * respeta RLS). `orderedIds` es la lista completa en el nuevo orden. */
export async function reorderQuoteStatuses(db: Db, orderedIds: string[]): Promise<void> {
  const { error } = await db.rpc("reorder_quote_statuses", { p_ids: orderedIds });
  if (error) throw error;
}
