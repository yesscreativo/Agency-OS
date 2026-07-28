import type { Tables, TablesInsert, TablesUpdate } from "../types/database";
import type { Db, Page } from "./shared";

// Antes era el enum Postgres `quote_status`; ahora los estados son un catálogo
// administrable (tabla quote_statuses) y la columna es texto libre validada por
// FK, así que el tipo de código es `string` (incluye estados custom por org).
export type QuoteStatusDb = string;

/** Fila de la lista: cotización + cliente + ítems mínimos para calcular totales. */
export type QuoteListRow = Tables<"quotes"> & {
  client: Pick<Tables<"clients">, "id" | "name" | "company"> | null;
  quote_items: Pick<
    Tables<"quote_items">,
    "client_price" | "cost_price" | "quantity" | "is_group"
  >[];
};

export type QuoteDetail = Tables<"quotes"> & {
  client: Tables<"clients"> | null;
  quote_items: Tables<"quote_items">[];
  quote_recipients: Tables<"quote_recipients">[];
};

export interface QuoteListFilters {
  search?: string;
  status?: QuoteStatusDb;
  /** ISO date (inclusive) sobre created_at. */
  dateFrom?: string;
  dateTo?: string;
  /** Por defecto se ocultan `closed`; true las incluye. */
  includeClosed?: boolean;
  /** uuid de la KAM/PM asignada (quotes.kam_id). */
  kamId?: string;
  page?: number;
  pageSize?: number;
}

const LIST_SELECT =
  "*, client:clients(id, name, company), quote_items(client_price, cost_price, quantity, is_group)";

/** Resuelve las condiciones del .or() de búsqueda (código, nombre de cotización y
 * cliente por name/company). PostgREST no permite un or() top-level sobre columnas
 * embebidas, así que la búsqueda por cliente se resuelve con una pre-query de ids.
 * Devuelve null si el término queda vacío tras sanear. Compartido por listQuotes y
 * listQuoteStatsRows para que la lista y los KPI filtren igual. */
async function buildSearchConditions(db: Db, search: string): Promise<string[] | null> {
  // El parser del or() de PostgREST usa `,` y `()` como separadores — se quitan del término.
  const term = search.replace(/[,()"]/g, "").trim();
  if (!term) return null;
  const { data: matchedClients, error } = await db
    .from("clients")
    .select("id")
    .is("deleted_at", null)
    .or(`name.ilike.%${term}%,company.ilike.%${term}%`);
  if (error) throw error;
  const clientIds = (matchedClients ?? []).map((c) => c.id);
  const conditions = [`code.ilike.%${term}%`, `quote_name.ilike.%${term}%`];
  if (clientIds.length > 0) conditions.push(`client_id.in.(${clientIds.join(",")})`);
  return conditions;
}

export async function listQuotes(
  db: Db,
  filters: QuoteListFilters = {},
): Promise<Page<QuoteListRow>> {
  const { search, status, dateFrom, dateTo, includeClosed = false, kamId } = filters;
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));

  let query = db
    .from("quotes")
    .select(LIST_SELECT, { count: "exact" })
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (status) {
    query = query.eq("status", status);
  } else if (!includeClosed) {
    query = query.neq("status", "closed");
  }
  if (dateFrom) query = query.gte("created_at", dateFrom);
  if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59.999Z`);
  if (kamId) query = query.eq("kam_id", kamId);
  if (search) {
    const conditions = await buildSearchConditions(db, search);
    if (conditions) query = query.or(conditions.join(","));
  }

  const { data, error, count } = await query.returns<QuoteListRow[]>();
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0, page, pageSize };
}

/** Fila del tablero Kanban: cotización + cliente + KAM + ítems para el total. */
export type PipelineQuoteRow = QuoteListRow & {
  kam: Pick<Tables<"kams">, "id" | "name"> | null;
};

const PIPELINE_SELECT =
  "*, client:clients(id, name, company), kam:kams(id, name), quote_items(client_price, cost_price, quantity, is_group)";

/** Todas las cotizaciones no borradas para el pipeline (agrupadas por estado en
 * la app), con los mismos filtros que la lista. Pagina internamente en bloques de
 * 1000 (límite de PostgREST). `includeClosed` por defecto oculta las cerradas
 * (paridad con la lista); la columna Cerrada existe igual pero sin tarjetas. */
export async function listPipelineQuotes(
  db: Db,
  filters: QuoteListFilters = {},
): Promise<PipelineQuoteRow[]> {
  const { search, status, dateFrom, dateTo, includeClosed = false, kamId } = filters;
  const searchConditions = search ? await buildSearchConditions(db, search) : null;
  const pageSize = 1000;
  const rows: PipelineQuoteRow[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = db
      .from("quotes")
      .select(PIPELINE_SELECT)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (status) query = query.eq("status", status);
    else if (!includeClosed) query = query.neq("status", "closed");
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59.999Z`);
    if (kamId) query = query.eq("kam_id", kamId);
    if (searchConditions) query = query.or(searchConditions.join(","));
    const { data, error } = await query.returns<PipelineQuoteRow[]>();
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

/** Fila mínima para los KPIs globales de la lista (conteo + suma por estado). */
export type QuoteStatsRow = Pick<
  Tables<"quotes">,
  "status" | "currency" | "has_iva" | "iva_percentage"
> & {
  quote_items: Pick<
    Tables<"quote_items">,
    "client_price" | "cost_price" | "quantity" | "is_group"
  >[];
};

const STATS_SELECT =
  "status, currency, has_iva, iva_percentage, quote_items(client_price, cost_price, quantity, is_group)";

/** Filtros de los KPI: los mismos de la lista SALVO `status`, para que el desglose
 * por estado (Enviadas/Aceptadas/…) siga teniendo sentido aunque filtres por un
 * estado puntual en la tabla. */
export type QuoteStatsFilters = Omit<QuoteListFilters, "status" | "page" | "pageSize">;

/** Cotizaciones no borradas (con los filtros de la lista salvo estado), con lo justo
 * para calcular totales en app (calcQuote vive en TypeScript; replicarlo en SQL
 * duplicaría la lógica). Pagina internamente en bloques de 1000 por el límite de
 * filas de PostgREST. */
export async function listQuoteStatsRows(
  db: Db,
  filters: QuoteStatsFilters = {},
): Promise<QuoteStatsRow[]> {
  const { search, dateFrom, dateTo, includeClosed = false, kamId } = filters;
  const searchConditions = search ? await buildSearchConditions(db, search) : null;
  const pageSize = 1000;
  const rows: QuoteStatsRow[] = [];
  for (let from = 0; ; from += pageSize) {
    let query = db
      .from("quotes")
      .select(STATS_SELECT)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, from + pageSize - 1);
    if (!includeClosed) query = query.neq("status", "closed");
    if (dateFrom) query = query.gte("created_at", dateFrom);
    if (dateTo) query = query.lte("created_at", `${dateTo}T23:59:59.999Z`);
    if (kamId) query = query.eq("kam_id", kamId);
    if (searchConditions) query = query.or(searchConditions.join(","));
    const { data, error } = await query.returns<QuoteStatsRow[]>();
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  return rows;
}

export async function getQuoteById(db: Db, id: string): Promise<QuoteDetail | null> {
  const { data, error } = await db
    .from("quotes")
    .select("*, client:clients(*), quote_items(*), quote_recipients(*)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<QuoteDetail>();
  if (error) throw error;
  if (!data) return null;
  data.quote_items = data.quote_items
    .filter((item) => !item.deleted_at)
    .sort((a, b) => a.sort_order - b.sort_order);
  return data;
}

export async function createQuote(db: Db, values: TablesInsert<"quotes">) {
  const { data, error } = await db.from("quotes").insert(values).select().single();
  if (error) throw error;
  return data;
}

export async function updateQuote(db: Db, id: string, values: TablesUpdate<"quotes">) {
  const { data, error } = await db.from("quotes").update(values).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

/** Soft delete (deleted_at), según convención del esquema. */
export async function softDeleteQuote(db: Db, id: string) {
  const { error } = await db
    .from("quotes")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

/** Reemplaza el set de ítems de una cotización (estrategia del autosave:
 * borrar+insertar mantiene el sort_order simple y atómico a nivel de fila). */
/** Sincroniza los ítems por id ESTABLE (el cliente genera el uuid de los nuevos):
 * borra los que ya no están, y hace upsert del resto. NO incluye status/client_comment
 * en el payload, así el upsert conserva la respuesta del cliente de las filas existentes
 * (y las nuevas quedan con el default `pending`). Los ids estables evitan que un
 * reguardado/autosave pierda la respuesta o los precios preservados por rol. */
export async function replaceQuoteItems(
  db: Db,
  quoteId: string,
  items: (Omit<TablesInsert<"quote_items">, "quote_id"> & { id: string })[],
) {
  if (items.length === 0) {
    const { error } = await db.from("quote_items").delete().eq("quote_id", quoteId);
    if (error) throw error;
    return [];
  }
  const ids = items.map((i) => i.id);
  const { error: deleteError } = await db
    .from("quote_items")
    .delete()
    .eq("quote_id", quoteId)
    .not("id", "in", `(${ids.join(",")})`);
  if (deleteError) throw deleteError;

  const { data, error } = await db
    .from("quote_items")
    .upsert(items.map((item, i) => ({ ...item, quote_id: quoteId, sort_order: i })))
    .select();
  if (error) throw error;
  return data;
}

export interface QuoteItemResponse {
  id: string;
  status: "pending" | "accepted" | "rejected" | "changes";
  client_comment: string | null;
}

/** Actualiza IN-PLACE la respuesta del cliente por ítem (status + comentario) desde la
 * vista pública `/respuesta`. A diferencia de `replaceQuoteItems` (borrar+insertar del
 * autosave), aquí se preservan las filas y sus ids — solo se tocan status y client_comment. */
export async function setQuoteItemResponses(db: Db, responses: QuoteItemResponse[]) {
  for (const r of responses) {
    const { error } = await db
      .from("quote_items")
      .update({ status: r.status, client_comment: r.client_comment })
      .eq("id", r.id);
    if (error) throw error;
  }
}

/** Consecutivo atómico por cliente/día para la numeración MES+CLIENTE+DDMMAAAA-NN. */
export async function nextQuoteSeq(db: Db, clientId: string, day: string): Promise<number> {
  const { data, error } = await db.rpc("next_quote_seq", { p_client_id: clientId, p_day: day });
  if (error) throw error;
  return data as number;
}
