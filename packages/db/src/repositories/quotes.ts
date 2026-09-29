import type { Tables, TablesInsert, TablesUpdate } from "../types/database";
import type { Db, Page } from "./shared";

// Antes era el enum Postgres `quote_status`; ahora los estados son un catálogo
// administrable (tabla quote_statuses) y la columna es texto libre validada por
// FK, así que el tipo de código es `string` (incluye estados custom por org).
export type QuoteStatusDb = string;

/** Ítem tal como lo devuelve la RPC `get_quote_items_secure`: `client_price`/
 * `cost_price` llegan en `null` cuando el usuario que consulta no tiene el
 * permiso correspondiente (ver 046_quote_items_secure_rpc.sql). */
type MaskedPriceFields = { client_price: number | null; cost_price: number | null };

/** Fila cruda de `get_quote_items_secure`. */
export interface SecureQuoteItemRow extends MaskedPriceFields {
  id: string;
  quote_id: string;
  description: string;
  quantity: number;
  status: Tables<"quote_items">["status"];
  client_comment: string | null;
  sort_order: number;
  supplier: string | null;
  is_group: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

/** Trae los ítems enmascarados (según el permiso del usuario de la sesión) de
 * un conjunto de cotizaciones vía RPC (no se puede embeber: `quote_items` no
 * es seleccionable directo por `authenticated`, ver 046_quote_items_secure_rpc.sql)
 * y los agrupa por `quote_id`, ya filtrados por `deleted_at` y ordenados por
 * `sort_order` — mismo contrato que traía el embed de PostgREST. */
export async function fetchSecureItemsByQuoteIds(
  db: Db,
  quoteIds: string[],
): Promise<Map<string, SecureQuoteItemRow[]>> {
  const map = new Map<string, SecureQuoteItemRow[]>();
  if (quoteIds.length === 0) return map;
  const { data, error } = await db
    .rpc("get_quote_items_secure", { p_quote_ids: quoteIds })
    .returns<SecureQuoteItemRow[]>();
  if (error) throw error;
  for (const item of data ?? []) {
    if (item.deleted_at) continue;
    const list = map.get(item.quote_id);
    if (list) list.push(item);
    else map.set(item.quote_id, [item]);
  }
  for (const list of map.values()) list.sort((a, b) => a.sort_order - b.sort_order);
  return map;
}

/** Fila de la lista: cotización + cliente + ítems mínimos para calcular totales. */
export type QuoteListRow = Tables<"quotes"> & {
  client: Pick<Tables<"clients">, "id" | "name" | "company"> | null;
  quote_items: (Pick<Tables<"quote_items">, "quantity" | "is_group"> & MaskedPriceFields)[];
};

export type QuoteDetail = Tables<"quotes"> & {
  client: Tables<"clients"> | null;
  quote_items: Tables<"quote_items">[];
  quote_recipients: Tables<"quote_recipients">[];
};

/** Igual que `QuoteDetail`, pero los ítems vienen de `quote_items_secure`
 * (precios enmascarados según el permiso de quien consulta). Úsala para
 * DISPLAY con el cliente de sesión; para operaciones internas que necesitan el
 * valor real sin importar el permiso del usuario (preservar al guardar, armar
 * la orden a proveedor, snapshot de versión al enviar) usa `getQuoteById` con
 * el cliente service-role — ver quote-actions.ts/supplier-order-actions.ts. */
export type QuoteDetailMasked = Tables<"quotes"> & {
  client: Tables<"clients"> | null;
  quote_items: (Omit<Tables<"quote_items">, "client_price" | "cost_price"> & MaskedPriceFields)[];
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

const LIST_SELECT = "*, client:clients(id, name, company)";

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

  const { data, error, count } = await query.returns<Omit<QuoteListRow, "quote_items">[]>();
  if (error) throw error;
  const rows = data ?? [];
  const itemsByQuoteId = await fetchSecureItemsByQuoteIds(
    db,
    rows.map((r) => r.id),
  );
  return {
    rows: rows.map((row) => ({ ...row, quote_items: itemsByQuoteId.get(row.id) ?? [] })),
    total: count ?? 0,
    page,
    pageSize,
  };
}

/** Fila del tablero Kanban: cotización + cliente + KAM + ítems para el total. */
export type PipelineQuoteRow = QuoteListRow & {
  kam: Pick<Tables<"kams">, "id" | "name"> | null;
};

const PIPELINE_SELECT =
  "*, client:clients(id, name, company), kam:kams(id, name)";

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
  const rows: Omit<PipelineQuoteRow, "quote_items">[] = [];
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
    const { data, error } = await query.returns<Omit<PipelineQuoteRow, "quote_items">[]>();
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  const itemsByQuoteId = await fetchSecureItemsByQuoteIds(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((row) => ({ ...row, quote_items: itemsByQuoteId.get(row.id) ?? [] }));
}

/** Fila mínima para los KPIs globales de la lista (conteo + suma por estado). */
export type QuoteStatsRow = Pick<
  Tables<"quotes">,
  "id" | "status" | "currency" | "has_iva" | "iva_percentage"
> & {
  quote_items: (Pick<Tables<"quote_items">, "quantity" | "is_group"> & MaskedPriceFields)[];
};

const STATS_SELECT = "id, status, currency, has_iva, iva_percentage";

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
  const rows: Omit<QuoteStatsRow, "quote_items">[] = [];
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
    const { data, error } = await query.returns<Omit<QuoteStatsRow, "quote_items">[]>();
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) break;
  }
  const itemsByQuoteId = await fetchSecureItemsByQuoteIds(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((row) => ({ ...row, quote_items: itemsByQuoteId.get(row.id) ?? [] }));
}

/** Ítems SIN enmascarar (cost_price/client_price reales). Debe llamarse con el
 * cliente service-role — quien la use debe validar antes que la cotización
 * pertenece a la organización del usuario, ya que el service-role no pasa por
 * RLS (ver saveQuoteDraft, sendQuote, sendSupplierOrder). Para DISPLAY con el
 * cliente de sesión usa `getQuoteByIdMasked`. */
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

/** Igual que `getQuoteById`, pero los ítems vienen de la RPC `get_quote_items_secure`:
 * cost_price/client_price llegan en null si el usuario de la sesión no tiene
 * el permiso correspondiente. Úsala para renderizar (list/detalle/impresión);
 * NO para operaciones que necesiten el valor real (ver `getQuoteById`). */
export async function getQuoteByIdMasked(db: Db, id: string): Promise<QuoteDetailMasked | null> {
  const { data, error } = await db
    .from("quotes")
    .select("*, client:clients(*), quote_recipients(*)")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle<Omit<QuoteDetailMasked, "quote_items">>();
  if (error) throw error;
  if (!data) return null;
  const itemsByQuoteId = await fetchSecureItemsByQuoteIds(db, [data.id]);
  return { ...data, quote_items: itemsByQuoteId.get(data.id) ?? [] };
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
 * borra los que ya no están, e inserta/actualiza el resto SEPARADO a mano
 * (nunca upsert/ON CONFLICT: Postgres exige SELECT sobre cualquier columna
 * referenciada como `excluded.col`, lo que reabriría la lectura de
 * cost_price/client_price que 048_quote_items_column_grants.sql bloqueó a
 * propósito para `authenticated`). El insert de ítems nuevos NO incluye
 * status/client_comment, así quedan con su default (`pending`/null); el update
 * de ítems existentes tampoco los toca, así se conserva la respuesta del
 * cliente. Los ids estables evitan que un reguardado/autosave la pierda o
 * pierda los precios preservados por rol. */
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

  const { data: existingRows, error: existingError } = await db
    .from("quote_items")
    .select("id")
    .eq("quote_id", quoteId);
  if (existingError) throw existingError;
  const existingIds = new Set((existingRows ?? []).map((r) => r.id));

  const rows = items.map((item, i) => ({ ...item, quote_id: quoteId, sort_order: i }));
  const toInsert = rows.filter((row) => !existingIds.has(row.id));
  const toUpdate = rows.filter((row) => existingIds.has(row.id));

  if (toInsert.length > 0) {
    const { error } = await db.from("quote_items").insert(toInsert);
    if (error) throw error;
  }
  for (const { id, ...values } of toUpdate) {
    const { error } = await db.from("quote_items").update(values).eq("id", id);
    if (error) throw error;
  }
  return rows.map((row) => ({ id: row.id }));
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

/** Fila de un brief ya subido a alguna cotización (candidato para reutilizar en otra). */
export interface ExistingBriefRow {
  quoteId: string;
  code: string | null;
  clientName: string | null;
  briefPath: string;
  /** Derivada del prefijo `<timestamp>-` del path; null si no matchea el patrón. */
  uploadedAt: string | null;
}

const parseBriefUploadedAt = (path: string): string | null => {
  const match = path.split("/").pop()?.match(/^(\d+)[-_]/);
  if (!match) return null;
  const ts = Number(match[1]);
  return Number.isFinite(ts) ? new Date(ts).toISOString() : null;
};

/** Briefs ya subidos a otras cotizaciones de la organización (RLS de `quotes`
 * ya scopea por org), para reutilizarlos sin volver a subir el mismo archivo.
 * `clientId` filtra al cliente de la cotización actual; sin filtro trae todos. */
export async function listExistingBriefs(
  db: Db,
  options: { excludeQuoteId?: string; clientId?: string } = {},
): Promise<ExistingBriefRow[]> {
  let query = db
    .from("quotes")
    .select("id, code, brief_url, client:clients(name)")
    .is("deleted_at", null)
    .not("brief_url", "is", null)
    .order("created_at", { ascending: false })
    .limit(200);
  if (options.excludeQuoteId) query = query.neq("id", options.excludeQuoteId);
  if (options.clientId) query = query.eq("client_id", options.clientId);

  const { data, error } = await query.returns<
    { id: string; code: string | null; brief_url: string | null; client: { name: string } | null }[]
  >();
  if (error) throw error;

  return (data ?? [])
    .filter((row): row is typeof row & { brief_url: string } => Boolean(row.brief_url))
    .map((row) => ({
      quoteId: row.id,
      code: row.code,
      clientName: row.client?.name ?? null,
      briefPath: row.brief_url,
      uploadedAt: parseBriefUploadedAt(row.brief_url),
    }));
}

/** Consecutivo atómico por cliente/día para la numeración MES+CLIENTE+DDMMAAAA-NN. */
export async function nextQuoteSeq(db: Db, clientId: string, day: string): Promise<number> {
  const { data, error } = await db.rpc("next_quote_seq", { p_client_id: clientId, p_day: day });
  if (error) throw error;
  return data as number;
}
